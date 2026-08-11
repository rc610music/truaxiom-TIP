import { existsSync } from "node:fs";

const requiredPaths = [
  "README.md",
  "package.json",
  "tsconfig.base.json",
  "apps/mission-control/package.json",
  "apps/mission-control/src/App.tsx",
  "apps/mission-control/src/apiClient.ts",
  "apps/mission-control/src/index.css",
  "apps/api/package.json",
  "apps/api/src/server.ts",
  "apps/api/src/persistence.ts",
  "packages/types/src/index.ts",
  "packages/core/src/index.ts",
  "packages/core/src/seed.ts",
  "packages/core/src/dataAccess.ts",
  "packages/core/src/crawlerAdapter.ts",
  "packages/core/src/rootWorkContentMap.ts",
  "packages/core/src/apiGateway.ts",
  "packages/core/src/bootstrapSnapshot.ts",
  "packages/core/src/serverRuntime.ts",
  "packages/core/src/reviewQueue.ts",
  "packages/core/src/reviewDecisionRepository.ts",
  "packages/core/src/postgresReviewDecisionAdapter.ts",
  "database/schema.sql",
  "database/002_content_ingestion.sql",
  "database/003_data_access_and_crawler.sql",
  "database/004_supabase_adapter_and_candidates.sql",
  "database/005_ai_and_review_workflows.sql",
  "database/006_api_runtime.sql",
  "database/007_review_queue.sql",
  "database/008_postgres_review_decision_adapter.sql",
  "docs/sprints/SPRINT_001_Foundation.md",
  "docs/sprints/SPRINT_002_Core_Platform_Draft.md",
  "docs/sprints/SPRINT_002_PROGRESS.md",
  "docs/sprints/SPRINT_002_API_REVIEW_QUEUE_ADDENDUM.md",
  "docs/development/SERVER_SIDE_SETUP.md",
  "docs/development/REVIEW_QUEUE.md",
  "docs/development/LOCAL_REVIEW_DECISION_LOOP.md",
  "docs/development/REVIEW_DECISION_REPOSITORY.md",
  "docs/development/API_PERSISTENCE_RUNTIME.md",
  "docs/development/POSTGRES_NEON_BRIDGE.md",
  "docs/deployment/DEPLOYMENT_TARGETS.md",
  "docs/deployment/SUPABASE_BOOTSTRAP_CHECKLIST.md",
  "docs/architecture/API-0001_API_Gateway.md"
];

const missing = requiredPaths.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.error("TIP structure check failed. Missing required paths:");
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

console.log(`TIP structure check passed. ${requiredPaths.length} required paths found.`);
