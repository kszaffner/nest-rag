interface ClientWindow {
  windowStartInMilliseconds: number;
  requestCount: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the client may try again. Zero when allowed. */
  retryAfterInSeconds: number;
}

export interface FixedWindowRateLimiterOptions {
  maxRequestsPerWindow: number;
  windowInMilliseconds: number;
  /** Upper bound for the memory used, see FixedWindowRateLimiter. */
  maxTrackedClients: number;
}

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Allows each client (identified by a key such as an IP address) a limited
 * number of requests in a fixed time window. State lives in memory, so the
 * limit is per application instance and resets on restart. For several
 * instances use a shared store (for example Redis).
 *
 * Memory is bounded: expired windows are removed when the table is full, and
 * when it is still full of active clients, new clients are refused instead of
 * growing the table without limit (OWASP API4: Unrestricted Resource
 * Consumption). Failing closed is the safe choice here.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, ClientWindow>();

  constructor(
    private readonly options: FixedWindowRateLimiterOptions,
    private readonly now: () => number = Date.now,
  ) {}

  check(clientKey: string): RateLimitDecision {
    const currentTime = this.now();
    const existingWindow = this.windows.get(clientKey);

    if (
      existingWindow &&
      currentTime - existingWindow.windowStartInMilliseconds <
        this.options.windowInMilliseconds
    ) {
      if (existingWindow.requestCount >= this.options.maxRequestsPerWindow) {
        return this.refuse(existingWindow, currentTime);
      }
      existingWindow.requestCount += 1;
      return { allowed: true, retryAfterInSeconds: 0 };
    }

    if (
      !existingWindow &&
      this.windows.size >= this.options.maxTrackedClients
    ) {
      this.removeExpiredWindows(currentTime);
      if (this.windows.size >= this.options.maxTrackedClients) {
        return {
          allowed: false,
          retryAfterInSeconds: this.secondsToWait(
            this.options.windowInMilliseconds,
          ),
        };
      }
    }

    this.windows.set(clientKey, {
      windowStartInMilliseconds: currentTime,
      requestCount: 1,
    });
    return { allowed: true, retryAfterInSeconds: 0 };
  }

  private refuse(window: ClientWindow, currentTime: number): RateLimitDecision {
    const windowEnd =
      window.windowStartInMilliseconds + this.options.windowInMilliseconds;
    return {
      allowed: false,
      retryAfterInSeconds: this.secondsToWait(windowEnd - currentTime),
    };
  }

  private removeExpiredWindows(currentTime: number): void {
    for (const [clientKey, window] of this.windows) {
      if (
        currentTime - window.windowStartInMilliseconds >=
        this.options.windowInMilliseconds
      ) {
        this.windows.delete(clientKey);
      }
    }
  }

  /** Rounds up, so the client never retries too early. */
  private secondsToWait(milliseconds: number): number {
    return Math.max(1, Math.ceil(milliseconds / MILLISECONDS_PER_SECOND));
  }
}
