import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { vi } from 'vitest';
import { configureApplication } from './../src/app-setup.js';
import { MAX_REQUESTS_PER_WINDOW } from './../src/rag/rate-limit.guard.js';
import { AppModule } from './../src/app.module.js';
import { LLM_PROVIDER } from './../src/llm/llm-provider.interface.js';

const PROVIDER_SECRET = 'sk-ant-secret-detail-from-provider';

describe('POST /rag/query (e2e)', () => {
  let app: INestApplication<App>;
  const generate = vi.fn();

  beforeEach(async () => {
    generate.mockReset();
    generate.mockResolvedValue({
      text: 'Lisbon.',
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 1000, outputTokens: 10 },
    });
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLM_PROVIDER)
      .useValue({ generate })
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApplication(app as NestExpressApplication);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers a question with sources, usage and cost', async () => {
    const response = await request(app.getHttpServer())
      .post('/rag/query')
      .send({ question: 'Where is the office?' })
      .expect(200);

    expect(response.body.answer).toBe('Lisbon.');
    expect(response.body.sources.length).toBeGreaterThan(0);
    expect(response.body.sources[0]).toEqual(
      expect.objectContaining({
        sourceId: expect.stringMatching(/#\d+$/),
        similarity: expect.any(Number),
        text: expect.any(String),
      }),
    );
    expect(response.body.model).toBe('claude-haiku-5-5');
    expect(response.body.estimatedCostInUsd).toBeGreaterThan(0);
    expect(response.body.wasTruncated).toBe(false);
  });

  it('rejects an invalid body with 400 and does not call the model', async () => {
    await request(app.getHttpServer())
      .post('/rag/query')
      .send({ question: 42 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/rag/query')
      .set('Content-Type', 'text/plain')
      .send('Where is the office?')
      .expect(400);

    expect(generate).not.toHaveBeenCalled();
  });

  it('hides provider details when the model fails', async () => {
    generate.mockRejectedValue(new Error(`bad key ${PROVIDER_SECRET}`));

    const response = await request(app.getHttpServer())
      .post('/rag/query')
      .send({ question: 'Where is the office?' })
      .expect(502);

    expect(JSON.stringify(response.body)).not.toContain(PROVIDER_SECRET);
    expect(response.body.message).toBe('The answer could not be generated');
  });

  it('rejects a body larger than the limit with 413', async () => {
    await request(app.getHttpServer())
      .post('/rag/query')
      .send({ question: 'a'.repeat(20_000) })
      .expect(413);

    expect(generate).not.toHaveBeenCalled();
  });

  it('answers 429 with Retry-After after too many requests', async () => {
    for (let count = 0; count < MAX_REQUESTS_PER_WINDOW; count += 1) {
      await request(app.getHttpServer())
        .post('/rag/query')
        .send({ question: 'Where is the office?' })
        .expect(200);
    }

    const response = await request(app.getHttpServer())
      .post('/rag/query')
      .send({ question: 'Where is the office?' })
      .expect(429);

    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(generate).toHaveBeenCalledTimes(MAX_REQUESTS_PER_WINDOW);
  });

  describe('POST /rag/query/stream', () => {
    /** supertest does not read text/event-stream by itself, so collect the text. */
    function postStream(body: unknown) {
      return request(app.getHttpServer())
        .post('/rag/query/stream')
        .buffer(true)
        .parse((response, callback) => {
          let text = '';
          response.on('data', (chunk: Buffer) => (text += chunk.toString()));
          response.on('end', () => callback(null, text));
        })
        .send(body as object);
    }

    function parseEvents(text: string) {
      return text
        .split('\n\n')
        .filter((block) => block.length > 0)
        .map((block) => {
          const [eventLine = '', dataLine = ''] = block.split('\n');
          return {
            type: eventLine.replace('event: ', ''),
            data: JSON.parse(dataLine.replace('data: ', '')),
          };
        });
    }

    it('streams sources, answer pieces and the totals', async () => {
      const response = await postStream({ question: 'Where is the office?' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-store');
      const events = parseEvents(response.body as string);
      expect(events[0]?.type).toBe('sources');
      expect(events[0]?.data.sources.length).toBeGreaterThan(0);
      expect(events.at(-1)?.type).toBe('done');
      expect(events.at(-1)?.data.estimatedCostInUsd).toBeGreaterThan(0);
      expect(
        events
          .filter((event) => event.type === 'delta')
          .map((event) => event.data.text)
          .join(''),
      ).toBe('Lisbon.');
    });

    it('rejects an invalid body with 400 before any stream starts', async () => {
      const response = await postStream({ question: 42 });

      expect(response.status).toBe(400);
      expect(generate).not.toHaveBeenCalled();
    });

    it('reports a model failure as an error event with a fixed text', async () => {
      generate.mockRejectedValue(new Error(`bad key ${PROVIDER_SECRET}`));

      const response = await postStream({ question: 'Where is the office?' });
      const text = JSON.stringify(response.body);

      // The sources are found first, so the failure comes after the stream
      // has started: it is reported as an "error" event with a fixed text.
      expect(text).not.toContain(PROVIDER_SECRET);
      expect(response.status).toBe(200);
      const events = parseEvents(response.body as string);
      expect(events.at(-1)).toEqual({
        type: 'error',
        data: { message: 'The answer could not be generated' },
      });
    });

    it('shares the request limit with the normal endpoint', async () => {
      for (let count = 0; count < MAX_REQUESTS_PER_WINDOW; count += 1) {
        await postStream({ question: 'Where is the office?' });
      }

      const response = await postStream({ question: 'Where is the office?' });

      expect(response.status).toBe(429);
    });
  });
});
