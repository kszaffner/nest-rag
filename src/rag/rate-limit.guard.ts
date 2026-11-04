import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FixedWindowRateLimiter } from './fixed-window-rate-limiter.js';

/** 10 questions per minute per client: plenty for a person, costly for a script. */
export const MAX_REQUESTS_PER_WINDOW = 10;
export const RATE_LIMIT_WINDOW_IN_MILLISECONDS = 60_000;
export const MAX_TRACKED_CLIENTS = 10_000;

const UNKNOWN_CLIENT_KEY = 'unknown';

/**
 * Limits how often one client can call an endpoint. Every question costs
 * computing time and, with a paid model, money.
 *
 * The client is identified by request.ip. Behind a reverse proxy that is the
 * address of the proxy, so every user would share one limit; in that case
 * enable Express "trust proxy" (and only then), so request.ip is the real
 * client address.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly rateLimiter = new FixedWindowRateLimiter({
    maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
    windowInMilliseconds: RATE_LIMIT_WINDOW_IN_MILLISECONDS,
    maxTrackedClients: MAX_TRACKED_CLIENTS,
  });

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const decision = this.rateLimiter.check(request.ip ?? UNKNOWN_CLIENT_KEY);

    if (!decision.allowed) {
      http
        .getResponse<Response>()
        .setHeader('Retry-After', String(decision.retryAfterInSeconds));
      throw new HttpException(
        'Too many requests, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
