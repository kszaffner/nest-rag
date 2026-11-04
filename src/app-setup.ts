import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { securityHeaders } from './security-headers.js';

/**
 * A question is at most 2000 characters, so 10 kB is generous. The Express
 * default of 100 kB lets a client make the server parse much more data than
 * any valid request needs (OWASP API4: Unrestricted Resource Consumption).
 */
export const MAX_REQUEST_BODY_SIZE = '10kb';

const PUBLIC_DIRECTORY_NAME = 'public';

/** Settings shared by the real application and the end-to-end tests. */
export function configureApplication(app: NestExpressApplication): void {
  // Do not tell attackers which framework runs the server.
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.useBodyParser('json', { limit: MAX_REQUEST_BODY_SIZE });
  // The frontend: static files served from the same address as the API, so
  // the browser needs no CORS. Only the files in "public" are reachable.
  app.useStaticAssets(join(process.cwd(), PUBLIC_DIRECTORY_NAME));
}
