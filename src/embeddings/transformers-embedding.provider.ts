import { join } from 'node:path';
import { assertValidEmbeddingBatch } from './embedding-input-limits.js';
import type {
  Embedding,
  EmbeddingProvider,
} from './embedding-provider.interface.js';

export const DEFAULT_MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const DEFAULT_MODEL_DIMENSIONS = 384;

/**
 * How many texts are sent to the model at once. Keeps memory use bounded no
 * matter how many texts the caller passes (up to MAX_TEXTS_PER_BATCH).
 */
export const INFERENCE_BATCH_SIZE = 32;

const DEFAULT_CACHE_DIRECTORY = join(process.cwd(), '.cache', 'models');
/**
 * Name of the library task that converts a text into a vector. "Feature
 * extraction" is the library's own term; the string must stay exactly as is.
 */
const TEXT_TO_VECTOR_TASK_NAME = 'feature-extraction';

/** Average the vectors of all words into one vector for the whole text. */
const POOLING_STRATEGY = 'mean';
/** Scale every vector to length 1, so a dot product equals cosine similarity. */
const SHOULD_NORMALIZE = true;

export interface TransformersEmbeddingOptions {
  /** Model id on the Hugging Face Hub. Must come from trusted configuration. */
  modelName: string;
  /** Length of the vectors this model returns. Verified on every call. */
  dimensions: number;
  /** Directory where the downloaded model files are stored. */
  cacheDirectory: string;
  /** When true, the model is never downloaded; loading fails if not cached. */
  localFilesOnly: boolean;
  /** Pins the model to an exact revision (commit) of the Hub repository. */
  modelRevision?: string;
}

/** Turns texts into vectors. Hides the library so tests can replace it. */
export type FeatureExtractor = (texts: string[]) => Promise<number[][]>;

export type FeatureExtractorFactory = (
  options: TransformersEmbeddingOptions,
) => Promise<FeatureExtractor>;

/*
 * KNOWN SECURITY ISSUE (accepted risk, reviewed 2026-11-04)
 *
 * `npm audit --omit=dev` reports 2 high severity findings for this dependency
 * tree, both coming from `sharp` 0.34.x (an image library used by
 * @huggingface/transformers): vulnerabilities in the bundled libvips, libheif
 * and librsvg (for example GHSA-f88m-g3jw-g9cj, GHSA-g89c-p67h-r497,
 * GHSA-wq5f-xc86-pv6w).
 *
 * Why we accept it: we only embed plain text and never pass images to the
 * library, so the vulnerable image decoders are not reachable from our code.
 * This is our assessment, not a proof.
 *
 * Why we are not on a fixed version: @huggingface/transformers 4.x (patched
 * sharp) needs onnxruntime-node 1.30, which has no binary for Intel Macs
 * (darwin/x64), so the package is pinned to 3.8.1 (onnxruntime-node 1.21).
 *
 * To remove the risk: on Apple Silicon or Linux upgrade to the latest 4.x and
 * run `npm audit --omit=dev` again. Never feed user-supplied images, SVG or
 * HEIF files to this library while it stays on 3.8.1.
 */

/**
 * Loads the real model. The library is imported lazily, so applications and
 * tests that use another provider never pay for loading it.
 */
export const createTransformersFeatureExtractor: FeatureExtractorFactory =
  async (options) => {
    const { pipeline } = await import('@huggingface/transformers');
    const extractionPipeline = await pipeline(
      TEXT_TO_VECTOR_TASK_NAME,
      options.modelName,
      {
        cache_dir: options.cacheDirectory,
        local_files_only: options.localFilesOnly,
        ...(options.modelRevision && { revision: options.modelRevision }),
      },
    );

    return async (texts) => {
      const embeddingsTensor = await extractionPipeline(texts, {
        pooling: POOLING_STRATEGY,
        normalize: SHOULD_NORMALIZE,
      });
      try {
        return embeddingsTensor.tolist() as number[][];
      } finally {
        // The tensor lives in native memory, which the garbage collector
        // does not manage, so it has to be released explicitly.
        embeddingsTensor.dispose();
      }
    };
  };

/**
 * Embeddings from a real model that runs locally in Node.js: no API key,
 * no cost, no text leaves the machine (after the one-time model download).
 * The model is loaded on first use, not at application start.
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  private readonly options: TransformersEmbeddingOptions;
  private readonly createFeatureExtractor: FeatureExtractorFactory;
  private featureExtractorPromise: Promise<FeatureExtractor> | undefined;

  constructor(
    options: Partial<TransformersEmbeddingOptions> = {},
    createFeatureExtractor: FeatureExtractorFactory = createTransformersFeatureExtractor,
  ) {
    this.options = {
      modelName: DEFAULT_MODEL_NAME,
      dimensions: DEFAULT_MODEL_DIMENSIONS,
      cacheDirectory: DEFAULT_CACHE_DIRECTORY,
      localFilesOnly: false,
      ...options,
    };
    this.dimensions = this.options.dimensions;
    this.createFeatureExtractor = createFeatureExtractor;
  }

  async embed(text: string): Promise<Embedding> {
    const [embedding] = await this.embedMany([text]);
    if (!embedding) {
      throw new Error('The model returned no embedding');
    }
    return embedding;
  }

  async embedMany(texts: readonly string[]): Promise<Embedding[]> {
    assertValidEmbeddingBatch(texts);
    if (texts.length === 0) {
      return [];
    }

    const extractFeatures = await this.getFeatureExtractor();
    const embeddings: Embedding[] = [];

    for (
      let batchStart = 0;
      batchStart < texts.length;
      batchStart += INFERENCE_BATCH_SIZE
    ) {
      const batchTexts = texts.slice(
        batchStart,
        batchStart + INFERENCE_BATCH_SIZE,
      );
      const batchEmbeddings = await extractFeatures(batchTexts);
      this.assertExpectedShape(batchEmbeddings, batchTexts.length);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /** Loads the model once; concurrent callers share the same loading. */
  private getFeatureExtractor(): Promise<FeatureExtractor> {
    this.featureExtractorPromise ??= this.createFeatureExtractor(
      this.options,
    ).catch((error: unknown) => {
      // Forget the failed attempt so the next call can try again.
      this.featureExtractorPromise = undefined;
      throw new Error(
        `Failed to load embedding model "${this.options.modelName}"`,
        { cause: error },
      );
    });
    return this.featureExtractorPromise;
  }

  /** Guards against a misconfigured model (wrong id or wrong dimensions). */
  private assertExpectedShape(
    embeddings: Embedding[],
    expectedCount: number,
  ): void {
    const hasExpectedShape =
      embeddings.length === expectedCount &&
      embeddings.every((embedding) => embedding.length === this.dimensions);
    if (!hasExpectedShape) {
      throw new Error(
        `The model "${this.options.modelName}" did not return ${expectedCount} embeddings with ${this.dimensions} dimensions`,
      );
    }
  }
}
