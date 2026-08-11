const apiBaseUrl = process.env.TIP_API_BASE_URL || "http://127.0.0.1:8787";

const requiredEndpoints = [
  "/health",
  "/v1/snapshot",
  "/v1/context/organization",
  "/v1/rootwork/content-map",
  "/v1/rootwork/mock-crawl",
  "/v1/recommendations/active",
  "/v1/review-queue"
];

async function assertEndpoint(path) {
  const url = `${apiBaseUrl}${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  return { path, body };
}

try {
  console.log(`Running TIP API smoke test against ${apiBaseUrl}`);

  for (const endpoint of requiredEndpoints) {
    await assertEndpoint(endpoint);
    console.log(`✓ ${endpoint}`);
  }

  console.log("TIP API smoke test passed.");
} catch (error) {
  console.error("TIP API smoke test failed.");
  console.error(error instanceof Error ? error.message : error);
  console.error("Start the API with: npm run dev:api");
  process.exit(1);
}
