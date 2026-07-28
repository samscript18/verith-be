const baseUrl = process.env.LOAD_TEST_BASE_URL ?? 'http://127.0.0.1:4000';
const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 500);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 25);
const maximumP95 = Number(process.env.LOAD_TEST_MAX_P95_MS ?? 500);
const durations = [];
let failures = 0;

async function runOne() {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/health/live`);
    if (!response.ok) failures += 1;
  } catch {
    failures += 1;
  } finally {
    durations.push(performance.now() - started);
  }
}

for (let offset = 0; offset < requests; offset += concurrency) {
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, requests - offset) },
      () => runOne(),
    ),
  );
}

durations.sort((left, right) => left - right);
const percentile = (value) =>
  durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)];
const result = {
  requests,
  concurrency,
  failures,
  p50Ms: percentile(0.5),
  p95Ms: percentile(0.95),
  p99Ms: percentile(0.99),
};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (failures > 0 || result.p95Ms > maximumP95) process.exitCode = 1;
