/**
 * Auto-refresh interval handling, kept free of React so it can be tested.
 */

export const MIN_REFRESH_INTERVAL_SECONDS = 30;
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 30;

/**
 * Parses a user- or storage-provided interval.
 *
 * @returns the interval in whole seconds when it is a finite number of at
 *   least {@link MIN_REFRESH_INTERVAL_SECONDS}, otherwise `null`. Empty
 *   strings, `null`, `NaN` and partial numbers such as `"30abc"` are all
 *   rejected.
 */
export function parseRefreshInterval(raw: unknown): number | null {
  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) {
    value = Number(raw);
  } else {
    return null;
  }
  if (!Number.isFinite(value) || value < MIN_REFRESH_INTERVAL_SECONDS) return null;
  return Math.floor(value);
}

/**
 * Returns a usable interval from a persisted value, falling back to the
 * default for anything invalid (e.g. a `null` left behind by
 * `JSON.stringify(NaN)` in older versions).
 */
export function sanitizeStoredInterval(raw: unknown): number {
  return parseRefreshInterval(raw) ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
}

/**
 * Runs `task` at most once at a time: calls made while a run is in flight
 * share that run's promise instead of starting a new one.
 */
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = task().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

export interface PollerOptions {
  /** Delay between the END of a run and the start of the next one. */
  intervalMs: number;
  run: () => Promise<void>;
  /** Returns true while the page is hidden; polling pauses meanwhile. */
  isHidden: () => boolean;
  /** Subscribes to visibility changes; returns an unsubscribe function. */
  onVisibilityChange: (listener: () => void) => () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Starts a polling loop built on chained timeouts, so a slow run can never
 * overlap with the next one. While the page is hidden no request is made;
 * when it becomes visible again a refresh runs immediately and the loop
 * resumes.
 *
 * @returns a function stopping the loop.
 */
export function startPolling(options: PollerOptions): () => void {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const intervalMs = Math.max(options.intervalMs, MIN_REFRESH_INTERVAL_SECONDS * 1000);

  let stopped = false;
  let running = false;
  let timer: unknown = null;
  let pausedWhileHidden = false;

  const schedule = () => {
    if (stopped) return;
    timer = setTimer(tick, intervalMs);
  };

  async function tick() {
    timer = null;
    if (stopped) return;
    if (options.isHidden()) {
      pausedWhileHidden = true;
      return;
    }
    running = true;
    try {
      await options.run();
    } catch {
      // Errors are reported by `run` itself; keep polling regardless.
    } finally {
      running = false;
    }
    schedule();
  }

  const unsubscribe = options.onVisibilityChange(() => {
    if (stopped || options.isHidden() || !pausedWhileHidden || running || timer !== null) return;
    pausedWhileHidden = false;
    void tick();
  });

  schedule();

  return () => {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    unsubscribe();
  };
}
