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
});
