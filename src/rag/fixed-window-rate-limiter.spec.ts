import { FixedWindowRateLimiter } from './fixed-window-rate-limiter.js';

const WINDOW = 60_000;

function createLimiter(maxRequestsPerWindow = 2, maxTrackedClients = 100) {
  let currentTime = 1_000_000;
  const limiter = new FixedWindowRateLimiter(
    {
      maxRequestsPerWindow,
      windowInMilliseconds: WINDOW,
      maxTrackedClients,
    },
    () => currentTime,
  );
  return {
    limiter,
    advance: (milliseconds: number) => {
      currentTime += milliseconds;
    },
  };
}

describe('FixedWindowRateLimiter', () => {
  it('allows requests up to the limit and refuses the next one', () => {
    const { limiter } = createLimiter();

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('counts every client separately', () => {
    const { limiter } = createLimiter(1);

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('tells how long to wait, rounded up to whole seconds', () => {
    const { limiter, advance } = createLimiter(1);
    limiter.check('a');
    advance(10_500);

    // 60 000 - 10 500 = 49 500 ms -> 50 s
    expect(limiter.check('a')).toEqual({
      allowed: false,
      retryAfterInSeconds: 50,
    });
  });

  it('allows again after the window ends', () => {
    const { limiter, advance } = createLimiter(1);
    limiter.check('a');
    advance(WINDOW);

    expect(limiter.check('a').allowed).toBe(true);
  });

  it('refuses new clients when the table is full of active ones', () => {
    const { limiter } = createLimiter(5, 2);
    limiter.check('a');
    limiter.check('b');

    expect(limiter.check('c').allowed).toBe(false);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('frees space taken by expired clients', () => {
    const { limiter, advance } = createLimiter(5, 2);
    limiter.check('a');
    limiter.check('b');
    advance(WINDOW);

    expect(limiter.check('c').allowed).toBe(true);
  });
});
