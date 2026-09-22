import {
  createInMemoryApprovedContentRepository,
  createInMemoryReviewDecisionRepository,
  createTipApiGateway,
  createTipBootstrapSnapshot,
  createInMemoryRepository,
  readOperatorAuth
} from "../packages/core/src/index.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const localOpen = readOperatorAuth({
  TIP_ENV: "test",
  TIP_PERSISTENCE_PROVIDER: "local-memory"
});
assert(localOpen.required === false, "Local-memory without a secret must leave the review gate open.");

const productionClosed = readOperatorAuth({
  TIP_ENV: "production",
  TIP_PERSISTENCE_PROVIDER: "postgres"
});
assert(productionClosed.required === true && !productionClosed.secret, "Production must fail closed until TIP_OPERATOR_SECRET is set.");

const durableClosed = readOperatorAuth({
  TIP_ENV: "test",
  TIP_PERSISTENCE_PROVIDER: "neon"
});
assert(durableClosed.required === true && !durableClosed.secret, "A durable provider must fail closed until TIP_OPERATOR_SECRET is set.");

const configured = readOperatorAuth({
  TIP_ENV: "test",
  TIP_PERSISTENCE_PROVIDER: "local-memory",
  TIP_OPERATOR_SECRET: "correct-secret",
  TIP_OPERATOR_ACTOR: "operator-ci"
});
assert(configured.required === true && configured.secret === "correct-secret" && configured.actor === "operator-ci", "A configured secret must be required and keep its actor.");

async function decisionCount(repository) {
  return (await repository.listDecisions()).length;
}

const closedRepository = createInMemoryReviewDecisionRepository();
const closedGateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  reviewDecisionRepository: closedRepository,
  operatorAuth: productionClosed
});
const closedDenied = await closedGateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-REC-0002",
    action: "approve",
    decidedBy: "public-client"
  }
});
assert(closedDenied.status === 401, `Unconfigured production gate must return 401, received ${closedDenied.status}.`);
assert(/not configured/i.test(String(closedDenied.body?.error ?? "")), "Unconfigured production gate must say the secret is not configured.");
assert(await decisionCount(closedRepository) === 0, "A fail-closed rejection must not record a decision.");

const contentRepository = createInMemoryApprovedContentRepository();
const reviewRepository = createInMemoryReviewDecisionRepository();
const gated = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  reviewDecisionRepository: reviewRepository,
  approvedContentRepository: contentRepository,
  operatorAuth: configured
});

const missing = await gated.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-HOME",
    action: "approve",
    decidedBy: "public-client"
  }
});
assert(missing.status === 401, `Missing secret must return 401, received ${missing.status}.`);
assert(String(missing.body?.error) === "Unauthorized.", "Missing secret must be unauthorized.");
assert(await decisionCount(reviewRepository) === 0, "Missing secret must not record a decision.");
assert((await contentRepository.list()).length === 0, "Missing secret must not write a content record.");

const wrong = await gated.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  headers: { authorization: "Bearer wrong-secret" },
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-HOME",
    action: "approve"
  }
});
assert(wrong.status === 401 && String(wrong.body?.error) === "Unauthorized.", "Wrong secret must be unauthorized.");
assert(await decisionCount(reviewRepository) === 0, "Wrong secret must not record a decision.");
assert((await contentRepository.list()).length === 0, "Wrong secret must not write a content record.");

const allowed = await gated.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  headers: { "x-tip-operator-secret": "correct-secret" },
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-HOME",
    action: "approve",
    decidedBy: "public-client"
  }
});
assert(allowed.status === 200, `Authorized approve failed with ${allowed.status}: ${allowed.body?.error ?? ""}`);
assert(allowed.body?.decision?.decidedBy === "operator-ci", "Authorized decision must store the operator actor, not the client string.");
assert(allowed.body?.contentRecord?.id === "CONTENT-FROM-CMC-EXT-ROOTWORK-HOME", "Authorized content approve must return the durable record.");
assert((await contentRepository.list()).length === 1, "Authorized content approve must write one row.");

const again = await gated.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  headers: { authorization: "Bearer correct-secret" },
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-HOME",
    action: "approve"
  }
});
assert(again.status === 200, "A second authorized approve must succeed.");
assert((await contentRepository.list()).length === 1, "A duplicate approve must still leave one content row.");
assert((await contentRepository.list())[0]?.id === "CONTENT-FROM-CMC-EXT-ROOTWORK-HOME", "The duplicate approve must keep the same content id.");

const openGateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  operatorAuth: localOpen
});
const openDecision = await openGateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-REC-0001",
    action: "defer",
    decidedBy: "founder-proof"
  }
});
assert(openDecision.status === 200 && openDecision.body?.decision?.decidedBy === "founder-proof", "Local-memory without a secret must keep the client actor.");

console.log("Operator review gate tests passed.");
