const apiBaseUrl = process.env.TIP_API_BASE_URL || "http://127.0.0.1:4310";
const timeoutMs = Number(process.env.TIP_API_WAIT_TIMEOUT_MS ?? 30_000);
const intervalMs = Number(process.env.TIP_API_WAIT_INTERVAL_MS ?? 1_000);
const startedAt = Date.now();

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealth() {
  const response = await fetch(`${apiBaseUrl}/health`);
  if (!response.ok) return false;
  const body = await response.json();
  return body?.status === "ok";
}

console.log(`Waiting for TIP API at ${apiBaseUrl}`);

while (Date.now() - startedAt < timeoutMs) {
  try {
    if (await checkHealth()) {
      console.log("TIP API is ready.");
      process.exit(0);
    }
  } catch {
    // Keep waiting until timeout.
  }

  await sleep(intervalMs);
}

console.error(`TIP API did not become ready within ${timeoutMs}ms.`);
process.exit(1);
