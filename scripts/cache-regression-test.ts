import { cached } from '../lib/cache';

async function main() {
  let computeCalls = 0;
  const compute = async () => {
    computeCalls += 1;
    return { value: computeCalls };
  };

  const key = `cache-regression:${Date.now()}`;
  const first = await cached(key, 60, compute, ['regression']);
  const second = await cached(key, 60, compute, ['regression']);

  if (computeCalls !== 1 || first.value !== 1 || second.value !== 1) {
    throw new Error(`Expected one shared computation, received ${computeCalls}`);
  }

  console.log('Cache regression: PASS (two reads, one computation)');
}

void main();
