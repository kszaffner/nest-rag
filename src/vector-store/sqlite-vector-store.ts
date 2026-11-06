import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Embedding } from '../embeddings/embedding-provider.interface.js';
import { createChunkId } from './chunk-id.js';
import { assertValidEmbedding, dotProduct } from './vector-math.js';
import {
  MAX_STORED_CHUNKS,
  resolveSearchOptions,
} from './vector-store-limits.js';
import type {
  ReplaceAllOptions,
  SearchOptions,
  SearchResult,
  StoredChunk,
  VectorStore,
} from './vector-store.interface.js';

/** Special SQLite name for a database that lives only in memory (tests). */
export const IN_MEMORY_DATABASE_PATH = ':memory:';

/** Bump it when the tables change, so an old file is never misread. */
const SCHEMA_VERSION = 1;
const NO_SCHEMA_VERSION = 0;
const MINIMUM_DIMENSIONS = 1;
const BYTES_PER_NUMBER = Float64Array.BYTES_PER_ELEMENT;
const FINGERPRINT_KEY = 'index_fingerprint';

/** The index contains the company documents, so only the owner may read it. */
const OWNER_ONLY_FILE_MODE = 0o600;
const OWNER_ONLY_DIRECTORY_MODE = 0o700;

export interface SqliteVectorStoreOptions {
  /** Path of the database file, or ":memory:". Trusted configuration only. */
  databasePath: string;
  /** Length of every embedding that will be stored and searched. */
  dimensions: number;
  /** Maximum number of chunks kept in the database. */
  maxStoredChunks?: number;
}

interface ChunkRow {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  text: string;
  embedding: Uint8Array;
}

interface SearchCandidate extends SearchResult {
  chunkId: string;
}

/**
 * Keeps chunks and embeddings in a SQLite file, so the index survives a
 * restart and does not have to be embedded again. An embedding is stored as a
 * BLOB of 8-byte numbers (exactly the values the in-memory store keeps) and
 * the search compares the query with every row, like InMemoryVectorStore.
 * That is exact and fast enough for thousands of chunks. Note that node:sqlite
 * is synchronous: a search blocks the event loop for its short duration.
 *
 * All values reach SQL as bound parameters, never as part of the SQL text.
 * Upgrade path for much larger data: let the database do the nearest-neighbour
 * search with the sqlite-vec extension behind the same VectorStore interface.
 */
export class SqliteVectorStore implements VectorStore {
  private readonly dimensions: number;
  private readonly maxStoredChunks: number;
  private readonly database: DatabaseSync;

  constructor(options: SqliteVectorStoreOptions) {
    if (
      !Number.isInteger(options.dimensions) ||
      options.dimensions < MINIMUM_DIMENSIONS
    ) {
      throw new RangeError(
        `dimensions must be a whole number of at least ${MINIMUM_DIMENSIONS}`,
      );
    }
    this.dimensions = options.dimensions;
    this.maxStoredChunks = options.maxStoredChunks ?? MAX_STORED_CHUNKS;
    this.database = this.openDatabase(options.databasePath);
  }

  async upsert(entries: readonly StoredChunk[]): Promise<void> {
    const entriesByChunkId = this.validateAndIndexEntries(entries);

    this.runInTransaction(() => {
      this.insertEntries(entriesByChunkId);
      if (this.countRows() > this.maxStoredChunks) {
        throw new RangeError(
          `Cannot store more than ${this.maxStoredChunks} chunks`,
        );
      }
      // The content changed, so the saved fingerprint no longer describes it.
      this.deleteFingerprint();
    });
  }

  async replaceAll(
    entries: readonly StoredChunk[],
    options: ReplaceAllOptions = {},
  ): Promise<void> {
    const entriesByChunkId = this.validateAndIndexEntries(entries);

    // One transaction: when anything fails, the previous content stays.
    this.runInTransaction(() => {
      this.database.exec('DELETE FROM chunks');
      this.insertEntries(entriesByChunkId);
      if (options.indexFingerprint === undefined) {
        this.deleteFingerprint();
      } else {
        this.database
          .prepare(
            'INSERT OR REPLACE INTO index_metadata (key, value) VALUES (?, ?)',
          )
          .run(FINGERPRINT_KEY, options.indexFingerprint);
      }
    });
  }

  async readIndexFingerprint(): Promise<string | undefined> {
    const row = this.database
      .prepare('SELECT value FROM index_metadata WHERE key = ?')
      .get(FINGERPRINT_KEY) as { value: string } | undefined;
    return row?.value;
  }

  async search(
    queryEmbedding: Embedding,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const { topK, minimumSimilarity } = resolveSearchOptions(options);
    assertValidEmbedding(queryEmbedding, this.dimensions);

    const candidates: SearchCandidate[] = [];
    const rows = this.database
      .prepare(
        'SELECT chunk_id, document_id, chunk_index, text, embedding FROM chunks',
      )
      .iterate() as Iterable<unknown>;
    for (const rawRow of rows) {
      const row = rawRow as ChunkRow;
      const similarity = dotProduct(
        queryEmbedding,
        this.decodeEmbedding(row.embedding),
      );
      if (similarity > minimumSimilarity) {
        candidates.push({
          chunkId: row.chunk_id,
          chunk: {
            documentId: row.document_id,
            index: row.chunk_index,
            text: row.text,
          },
          similarity,
        });
      }
    }

    candidates.sort(
      (first, second) =>
        second.similarity - first.similarity ||
        first.chunkId.localeCompare(second.chunkId),
    );

    return candidates
      .slice(0, topK)
      .map(({ chunk, similarity }) => ({ chunk, similarity }));
  }

  async count(): Promise<number> {
    return this.countRows();
  }

  /** Releases the database file. Called by Nest when the application stops. */
  onModuleDestroy(): void {
    this.close();
  }

  close(): void {
    if (this.database.isOpen) {
      this.database.close();
    }
  }

  private openDatabase(databasePath: string): DatabaseSync {
    const isFile = databasePath !== IN_MEMORY_DATABASE_PATH;
    if (isFile) {
      mkdirSync(dirname(databasePath), {
        recursive: true,
        mode: OWNER_ONLY_DIRECTORY_MODE,
      });
    }

    const database = new DatabaseSync(databasePath);
    try {
      if (isFile) {
        chmodSync(databasePath, OWNER_ONLY_FILE_MODE);
      }
      this.prepareSchema(database);
    } catch (error) {
      database.close();
      throw error;
    }
    return database;
  }

  private prepareSchema(database: DatabaseSync): void {
    const { user_version: existingVersion } = database
      .prepare('PRAGMA user_version')
      .get() as { user_version: number };
    if (
      existingVersion !== NO_SCHEMA_VERSION &&
      existingVersion !== SCHEMA_VERSION
    ) {
      throw new Error(
        `The database has schema version ${existingVersion}, expected ${SCHEMA_VERSION}`,
      );
    }

    database.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  /**
   * Validates everything before the database is touched, and collapses
   * entries with the same id (the last one wins, as in the in-memory store).
   */
  private validateAndIndexEntries(
    entries: readonly StoredChunk[],
  ): Map<string, StoredChunk> {
    if (entries.length > this.maxStoredChunks) {
      throw new RangeError(
        `Cannot store more than ${this.maxStoredChunks} chunks`,
      );
    }
    for (const entry of entries) {
      assertValidEmbedding(entry.embedding, this.dimensions);
    }
    return new Map(entries.map((entry) => [createChunkId(entry.chunk), entry]));
  }

  private insertEntries(entriesByChunkId: Map<string, StoredChunk>): void {
    const insertStatement = this.database.prepare(
      `INSERT OR REPLACE INTO chunks
         (chunk_id, document_id, chunk_index, text, embedding)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const [chunkId, entry] of entriesByChunkId) {
      insertStatement.run(
        chunkId,
        entry.chunk.documentId,
        entry.chunk.index,
        entry.chunk.text,
        this.encodeEmbedding(entry.embedding),
      );
    }
  }

  private deleteFingerprint(): void {
    this.database
      .prepare('DELETE FROM index_metadata WHERE key = ?')
      .run(FINGERPRINT_KEY);
  }

  private countRows(): number {
    const { total } = this.database
      .prepare('SELECT COUNT(*) AS total FROM chunks')
      .get() as { total: number };
    return Number(total);
  }

  private runInTransaction(work: () => void): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      work();
      this.database.exec('COMMIT');
    } catch (error) {
      this.rollbackQuietly();
      throw error;
    }
  }

  /** SQLite may already have rolled back by itself; the original error matters more. */
  private rollbackQuietly(): void {
    try {
      this.database.exec('ROLLBACK');
    } catch {
      // No transaction was active.
    }
  }

  private encodeEmbedding(embedding: Embedding): Uint8Array {
    return new Uint8Array(Float64Array.from(embedding).buffer);
  }

  private decodeEmbedding(storedBytes: Uint8Array): Float64Array {
    if (storedBytes.byteLength !== this.dimensions * BYTES_PER_NUMBER) {
      // The file was built for another embedding size or is damaged.
      throw new Error('The database contains an embedding of a wrong size');
    }
    // Copy, because a view into the driver buffer may not be aligned.
    return new Float64Array(
      storedBytes.buffer.slice(
        storedBytes.byteOffset,
        storedBytes.byteOffset + storedBytes.byteLength,
      ),
    );
  }
}
