import {
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  parseRefreshInterval,
  sanitizeStoredInterval,
  singleFlight,
  startPolling,
} from './refresh';

describe('parseRefreshInterval', () => {
  it('accepts whole or decimal numbers of at least 30 seconds', () => {
    expect(parseRefreshInterval(30)).toBe(30);
    expect(parseRefreshInterval('45')).toBe(45);
    expect(parseRefreshInterval(' 60.7 ')).toBe(60);
  });

  it.each([[''], [' '], ['abc'], ['30abc'], ['-30'], ['29'], [29], [NaN], [Infinity], [null], [undefined], [{}]])(
    'rejects %p',
    (value) => {
      expect(parseRefreshInterval(value)).toBeNull();
    }
  );
});

describe('sanitizeStoredInterval', () => {
  it('replaces the null persisted for NaN by older versions with the default', () => {
    expect(sanitizeStoredInterval(null)).toBe(DEFAULT_REFRESH_INTERVAL_SECONDS);
    expect(sanitizeStoredInterval(0)).toBe(DEFAULT_REFRESH_INTERVAL_SECONDS);
    expect(sanitizeStoredInterval(120)).toBe(120);
  });
});

describe('singleFlight', () => {
  it('shares the in-flight run between concurrent callers', async () => {
    let release: () => void = () => undefined;
    const task = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const run = singleFlight(task);

    const first = run();
    const second = run();
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);

    // once settled, the next call starts a new run
    const third = run();
    expect(task).toHaveBeenCalledTimes(2);
    release();
    await third;
  });
});

/**
 * Minimal deterministic timer/visibility harness for startPolling.
 */
function createHarness() {
  const timers: { fn: () => void; ms: number }[] = [];
  let hidden = false;
  let visibilityListener: () => void = () => undefined;
  return {
    timers,
    setHidden(value: boolean) {
      hidden = value;
      visibilityListener();
    },
    options: {
      isHidden: () => hidden,
      onVisibilityChange: (listener: () => void) => {
        visibilityListener = listener;
        return () => {
          visibilityListener = () => undefined;
        };
      },
      setTimer: (fn: () => void, ms: number) => {
        const timer = { fn, ms };
        timers.push(timer);
        return timer;
      },
      clearTimer: (handle: unknown) => {
        const index = timers.indexOf(handle as { fn: () => void; ms: number });
        if (index >= 0) timers.splice(index, 1);
      },
    },
    async fire() {
      const timer = timers.shift();
      if (!timer) throw new Error('no pending timer');
      timer.fn();
      // let the async run complete
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

describe('startPolling', () => {
  it('schedules the next run only after the previous one finished', async () => {
    const harness = createHarness();
    let finish: () => void = () => undefined;
    const run = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const stop = startPolling({ intervalMs: 30000, run, ...harness.options });

    expect(harness.timers).toHaveLength(1);
    expect(harness.timers[0].ms).toBe(30000);
    await harness.fire();
    expect(run).toHaveBeenCalledTimes(1);
    // still running: nothing scheduled, so no overlapping round can start
    expect(harness.timers).toHaveLength(0);

    finish();
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.timers).toHaveLength(1);
    stop();
    expect(harness.timers).toHaveLength(0);
  });

  it('never polls faster than the minimum interval', () => {
    const harness = createHarness();
    startPolling({ intervalMs: 0, run: jest.fn().mockResolvedValue(undefined), ...harness.options });
    expect(harness.timers[0].ms).toBe(30000);
  });

  it('keeps polling after a failed run', async () => {
    const harness = createHarness();
    const run = jest.fn().mockRejectedValue(new Error('down'));
    startPolling({ intervalMs: 30000, run, ...harness.options });
    await harness.fire();
    expect(harness.timers).toHaveLength(1);
  });

  it('pauses while hidden and refreshes immediately once visible', async () => {
    const harness = createHarness();
    const run = jest.fn().mockResolvedValue(undefined);
    startPolling({ intervalMs: 30000, run, ...harness.options });

    harness.setHidden(true);
    await harness.fire();
    expect(run).not.toHaveBeenCalled();
    expect(harness.timers).toHaveLength(0);

    harness.setHidden(false);
    await new Promise((resolve) => setImmediate(resolve));
    expect(run).toHaveBeenCalledTimes(1);
    expect(harness.timers).toHaveLength(1);

    // a visibility event while a timer is pending must not start a second chain
    harness.setHidden(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(harness.timers).toHaveLength(1);
  });

  it('does nothing after being stopped', async () => {
    const harness = createHarness();
    const run = jest.fn().mockResolvedValue(undefined);
    const stop = startPolling({ intervalMs: 30000, run, ...harness.options });
    const pending = harness.timers[0];
    stop();
    pending.fn();
    await new Promise((resolve) => setImmediate(resolve));
    expect(run).not.toHaveBeenCalled();
    harness.setHidden(false);
    expect(run).not.toHaveBeenCalled();
  });
});
