const { runPool } = require('../../src/utils/pool');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('runPool', () => {
  it('never exceeds the configured concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await runPool(items, 3, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(5);
      inFlight -= 1;
      return item;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('preserves input order in the results array', async () => {
    const items = [5, 1, 4, 2, 3];
    const results = await runPool(items, 2, async (item) => {
      // Reverse the completion order to prove positional (not completion) ordering.
      await delay(item);
      return item * 10;
    });

    expect(results).toEqual([50, 10, 40, 20, 30]);
  });

  it('propagates a worker rejection', async () => {
    const items = [1, 2, 3];
    await expect(
      runPool(items, 2, async (item) => {
        if (item === 2) throw new Error('boom');
        return item;
      })
    ).rejects.toThrow('boom');
  });

  it('resolves an empty array for an empty input', async () => {
    const results = await runPool([], 4, async (item) => item);
    expect(results).toEqual([]);
  });
});
