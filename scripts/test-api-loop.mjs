import { spawn } from "node:child_process";

const env = {
  ...process.env,
  TIP_API_BASE_URL: process.env.TIP_API_BASE_URL || "http://127.0.0.1:4310",
  TIP_API_PORT: process.env.TIP_API_PORT || "4310",
  TIP_PERSISTENCE_PROVIDER: process.env.TIP_PERSISTENCE_PROVIDER || "local-memory",
  TIP_SOURCE_HEALTH_MODE: process.env.TIP_SOURCE_HEALTH_MODE || "skip"
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function startApi() {
  return spawn("npm", ["run", "start:api"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env
  });
}

async function main() {
  if (env.TIP_API_TEST_BUILD === "true") {
    console.log("Building TIP API before smoke test...");
    await run("npm", ["run", "build:api"]);
  }

  console.log("Starting TIP API for smoke test...");
  const api = startApi();

  const stopApi = () => {
    if (!api.killed) api.kill("SIGTERM");
  };

  try {
    await run("node", ["scripts/wait-for-api.mjs"]);
    await run("node", ["scripts/smoke-api.mjs"]);
    console.log("TIP API loop test passed.");
  } finally {
    stopApi();
  }
}

main().catch((error) => {
  console.error("TIP API loop test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
