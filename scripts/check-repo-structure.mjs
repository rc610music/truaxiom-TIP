import { existsSync } from "node:fs";

const requiredPaths = [
  "README.md",
  "package.json",
  "tsconfig.base.json",
  "apps/mission-control/package.json",
  "apps/mission-control/src/App.tsx",
  "apps/mission-control/src/index.css",
  "packages/types/src/index.ts",
  "packages/core/src/index.ts",
  "packages/core/src/seed.ts",
  "packages/core/src/dataAccess.ts",
  "packages/core/src/crawlerAdapter.ts",
  "packages/core/src/rootWorkContentMap.ts",
  "database/schema.sql",
  "database/002_content_ingestion.sql",
  "database/003_data_access_and_crawler.sql",
  "docs/sprints/SPRINT_001_Foundation.md",
  "docs/sprints/SPRINT_002_Core_Platform_Draft.md",
  "docs/sprints/SPRINT_002_PROGRESS.md"
];

const missing = requiredPaths.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.error("TIP structure check failed. Missing required paths:");
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

console.log(`TIP structure check passed. ${requiredPaths.length} required paths found.`);
