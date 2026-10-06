const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TASK_COUNT = Number(process.env.TASK_COUNT || 100);
const RUNS = Number(process.env.RUNS || 20);

const email = `perf_${Date.now()}@example.com`;
const password = 'Password123';

async function request(path, options = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  const duration = performance.now() - startedAt;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${text}`);
  }

  return {
    duration,
    bytes: Buffer.byteLength(text, 'utf8'),
    text
  };
}

async function jsonRequest(path, options = {}) {
  const result = await request(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  return {
    ...result,
    json: JSON.parse(result.text)
  };
}

function percentile(sortedValues, percent) {
  const index = Math.ceil((percent / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

function calculateStats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);

  return {
    avg: Number((sum / sorted.length).toFixed(1)),
    median: Number(percentile(sorted, 50).toFixed(1)),
    p95: Number(percentile(sorted, 95).toFixed(1)),
    min: Number(sorted[0].toFixed(1)),
    max: Number(sorted[sorted.length - 1].toFixed(1))
  };
}

async function measureEndpoint(name, path, headers) {
  const times = [];
  let bytes = 0;

  for (let run = 1; run <= RUNS; run += 1) {
    const result = await request(path, { headers });
    times.push(result.duration);
    bytes = result.bytes;
  }

  return {
    endpoint: name,
    bytes,
    ...calculateStats(times)
  };
}

async function main() {
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`TASK_COUNT: ${TASK_COUNT}`);
  console.log(`RUNS: ${RUNS}`);

  await jsonRequest('/api/health');

  await jsonRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  const loginResponse = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  const token = loginResponse.json.token;
  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  for (let index = 1; index <= TASK_COUNT; index += 1) {
    await jsonRequest('/api/tasks', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: `Задача для замера ${index}`
      })
    });
  }

  const results = [];

  results.push(await measureEndpoint('GET /api/health', '/api/health', {}));

  results.push(
    await measureEndpoint(
      'GET /api/tasks?limit=10',
      '/api/tasks?page=1&limit=10',
      authHeaders
    )
  );

  results.push(
    await measureEndpoint(
      'GET /api/tasks?limit=100',
      '/api/tasks?page=1&limit=100',
      authHeaders
    )
  );

  console.table(
    results.map((item) => ({
      Эндпоинт: item.endpoint,
      'Среднее, мс': item.avg,
      'Медиана, мс': item.median,
      'P95, мс': item.p95,
      'Размер ответа, байт': item.bytes
    }))
  );
}

main().catch((error) => {
  console.error('Ошибка замера:', error.message);
  process.exitCode = 1;
});