import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from './../src/app-setup.js';
import { AppModule } from './../src/app.module.js';
import { CONTENT_SECURITY_POLICY } from './../src/security-headers.js';

describe('Frontend (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the page and its files', async () => {
    const page = await request(app.getHttpServer()).get('/').expect(200);
    expect(page.text).toContain('<title>Brightwave RAG</title>');
    await request(app.getHttpServer()).get('/app.js').expect(200);
    await request(app.getHttpServer()).get('/styles.css').expect(200);
  });

  it('sends security headers with the page, files and API', async () => {
    const responses = [
      await request(app.getHttpServer()).get('/'),
      await request(app.getHttpServer()).get('/app.js'),
      await request(app.getHttpServer()).get('/missing'),
      await request(app.getHttpServer()).post('/rag/query').send({}),
    ];

    for (const response of responses) {
      expect(response.headers['content-security-policy']).toBe(
        CONTENT_SECURITY_POLICY,
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('forbids inline scripts, other sites and framing in the policy', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline');
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });

  it('does not serve files from outside the public directory', async () => {
    await request(app.getHttpServer()).get('/../package.json').expect(404);
    await request(app.getHttpServer()).get('/%2e%2e/package.json').expect(404);
    await request(app.getHttpServer()).get('/package.json').expect(404);
  });
});

describe('Frontend files', () => {
  it('contain no inline script and never use innerHTML', async () => {
    const page = await readFile(
      join(process.cwd(), 'public', 'index.html'),
      'utf8',
    );
    const script = await readFile(
      join(process.cwd(), 'public', 'app.js'),
      'utf8',
    );

    // Every <script> must load a file, so a strict CSP can forbid inline code.
    expect(page.match(/<script(?![^>]*\bsrc=)[^>]*>/g)).toBeNull();
    expect(page).not.toMatch(/\son[a-z]+=/i);
    expect(script).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/,
    );
  });
});
