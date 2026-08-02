// Runs `worker` over `items` with at most `concurrency` in flight at once.
// Ported from lambda/pinger/index.js's runPool (a separate npm package root,
// so this is a deliberate copy rather than a cross-package require).
async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const results = [];

  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

module.exports = { runPool };
