import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * A question is at most 2000 characters, so 10 kB is generous. The Express
 * default of 100 kB lets a client make the server parse much more data than
 * any valid request needs (OWASP API4: Unrestricted Resource Consumption).
 */
export const MAX_REQUEST_BODY_SIZE = '10kb';

/** Settings shared by the real application and the end-to-end tests. */
export function configureApplication(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: MAX_REQUEST_BODY_SIZE });
}
