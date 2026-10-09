import { readFile } from "node:fs/promises";
import {
  synchronizeRuntimePacket,
  createCommandCenterCandidateTransport,
} from "../packages/core/src/commandCenterRuntimeBridge.ts";
// Explicit exported packet + project mapping. Never creates or stores a credential.
const packetFile = process.argv[2];
if (
  !packetFile ||
  !process.env.TIP_CC_PROJECT_ID ||
  !process.env.TIP_SOURCE_PROJECT_ID
)
  throw new Error(
    "Packet file and explicit TIP_SOURCE_PROJECT_ID / TIP_CC_PROJECT_ID required",
  );
const packet = JSON.parse(await readFile(packetFile, "utf8"));
try {
  const result = await synchronizeRuntimePacket(
    packet,
    {
      tipProjectId: process.env.TIP_SOURCE_PROJECT_ID,
      commandCenterProjectId: process.env.TIP_CC_PROJECT_ID,
      env: "development",
    },
    createCommandCenterCandidateTransport(process.env.TIP_CC_EXISTING_TOKEN),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    JSON.stringify({
      error: "Command Center synchronization stopped",
      status: error.status ?? null,
    }),
  );
  process.exitCode = 1;
}
