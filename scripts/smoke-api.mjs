const apiBaseUrl = process.env.TIP_API_BASE_URL || "http://127.0.0.1:4310";

const requiredEndpoints = [
  "/health",
  "/v1/snapshot",
  "/v1/context/organization",
  "/v1/rootwork/content-map",
  "/v1/rootwork/approved-content",
  "/v1/rootwork/mock-crawl",
  "/v1/recommendations/active",
  "/v1/registry",
  "/v1/review-queue",
  "/v1/review-queue/decisions",
  "/v1/ecosystem/status"
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

async function assertDecisionEndpoint(reviewQueue) {
  const firstReviewItem = reviewQueue?.queue?.items?.find((item) => item.status === "needs_review") ?? reviewQueue?.queue?.items?.[0];

  if (!firstReviewItem?.id) {
    throw new Error("Review queue smoke test could not find an item to decide.");
  }

  const decisionBody = {
    itemId: firstReviewItem.id,
    action: "defer",
    decidedBy: "smoke-test",
    note: "Smoke test simulated decision."
  };
  const operatorSecret = process.env.TIP_OPERATOR_SECRET?.trim();

  if (operatorSecret) {
    const denied = await fetch(`${apiBaseUrl}/v1/review-queue/decisions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(decisionBody)
    });
    if (denied.status !== 401) {
      throw new Error(`Unauthorized review POST should return 401, received ${denied.status}.`);
    }
    const deniedBody = await denied.json();
    if (!/unauthorized/i.test(String(deniedBody?.error ?? ""))) {
      throw new Error("Unauthorized review POST did not report an unauthorized error.");
    }
  }

  const headers = {
    "Content-Type": "application/json"
  };
  if (operatorSecret) headers.Authorization = `Bearer ${operatorSecret}`;

  const response = await fetch(`${apiBaseUrl}/v1/review-queue/decisions`, {
    method: "POST",
    headers,
    body: JSON.stringify(decisionBody)
  });

  if (!response.ok) {
    throw new Error(`/v1/review-queue/decisions failed with ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (body?.decision?.resultingStatus !== "deferred") {
    throw new Error("Review decision smoke test did not return deferred status.");
  }

  if (operatorSecret && body?.decision?.decidedBy !== (process.env.TIP_OPERATOR_ACTOR || "operator")) {
    throw new Error("Authorized review POST did not store the operator actor.");
  }

  const decisionsResponse = await fetch(`${apiBaseUrl}/v1/review-queue/decisions`);
  if (!decisionsResponse.ok) {
    throw new Error(`GET /v1/review-queue/decisions failed with ${decisionsResponse.status} ${decisionsResponse.statusText}`);
  }

  const decisionsBody = await decisionsResponse.json();
  const matchingDecision = decisionsBody?.decisions?.some((decision) => decision.id === body.decision.id);

  if (!matchingDecision) {
    throw new Error("Review decision smoke test did not find the recorded decision in the decision list.");
  }

  return body;
}

try {
  console.log(`Running TIP API smoke test against ${apiBaseUrl}`);

  let reviewQueue;

  for (const endpoint of requiredEndpoints) {
    const result = await assertEndpoint(endpoint);
    if (endpoint === "/v1/review-queue") reviewQueue = result.body;
    if (endpoint === "/v1/registry" && result.body?.version !== "v1") {
      throw new Error("/v1/registry did not report Registry v1.");
    }
    console.log(`✓ ${endpoint}`);
  }

  const decisionResult = await assertDecisionEndpoint(reviewQueue);
  console.log(`✓ POST /v1/review-queue/decisions (${decisionResult.persistence ?? "unknown persistence"})`);

  console.log("TIP API smoke test passed.");
} catch (error) {
  console.error("TIP API smoke test failed.");
  console.error(error instanceof Error ? error.message : error);
  console.error("Start the API with: npm run dev:api");
  process.exit(1);
}
