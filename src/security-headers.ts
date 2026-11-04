import type { NextFunction, Request, Response } from 'express';

/**
 * The page loads only its own files, so everything else is forbidden. In
 * particular no inline script and no scripts from other sites: if an
 * attacker manages to put markup on the page, the browser still refuses to
 * run it (defence in depth against XSS, OWASP A05/A03).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Adds security headers to every response. Strict-Transport-Security is
 * deliberately missing: it must be sent only over HTTPS, which is normally
 * terminated by a reverse proxy, so set it there.
 */
export function securityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  // The browser must not guess a different content type than the declared one.
  response.setHeader('X-Content-Type-Options', 'nosniff');
  // Old browsers do not know frame-ancestors, this header does the same.
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}
