import {
  synchronizeRuntimePacket,
  type CommandCenterTransport,
} from "./commandCenterRuntimeBridge";
import type { RuntimeDeliveryRepository } from "./runtimeDeliveryRepository";
import { RuntimeError } from "./runtimeContracts";

/** One bounded attempt; scheduling never changes mission authority or execution state. */
export async function deliverNextRuntimePacket(
  repository: RuntimeDeliveryRepository,
  transport: CommandCenterTransport,
  now: () => string = () => new Date().toISOString(),
) {
  const row = await repository.claim(now(), 120);
  if (!row) return { status: "IDLE" as const };
  const token = row.lease_token!;
  if (row.attempts > 8) {
    const saved = await repository.fail(
      row.delivery_id,
      token,
      now(),
      "ATTEMPT_LIMIT",
      now(),
      true,
    );
    return {
      status: saved ? ("PAUSED" as const) : ("FENCED" as const),
      delivery_id: row.delivery_id,
    };
  }
  const lease = async () => {
    if (!(await repository.renew(row.delivery_id, token, now(), 120)))
      throw new RuntimeError(409, "Delivery lease lost");
  };
  try {
    const fenced: CommandCenterTransport = {
      project: async (id) => {
        await lease();
        return transport.project(id);
      },
      write: async (path, body, key) => {
        await lease();
        return transport.write(path, body, key);
      },
    };
    const result = await synchronizeRuntimePacket(
      row.packet,
      {
        tipProjectId: row.target.tip_project_id,
        commandCenterProjectId: row.target.command_center_project_id,
        env: row.target.environment,
      },
      fenced,
    );
    if (
      !(await repository.finish(row.delivery_id, token, now(), result.task_id))
    )
      return { status: "FENCED" as const, delivery_id: row.delivery_id };
    return {
      status: "DELIVERED" as const,
      delivery_id: row.delivery_id,
      task_id: result.task_id,
    };
  } catch (error) {
    const status = error instanceof RuntimeError ? error.status : null;
    const retryable =
      status === null ||
      status === 408 ||
      status === 409 ||
      status === 429 ||
      (status >= 500 && status <= 599);
    const pause = !retryable || row.attempts >= 8;
    const code = status === null ? "TRANSPORT_UNAVAILABLE" : `HTTP_${status}`;
    const retryAt = new Date(
      Date.parse(now()) +
        Math.min(3600, 5 * 2 ** Math.min(row.attempts - 1, 10)) * 1000,
    ).toISOString();
    const saved = await repository.fail(
      row.delivery_id,
      token,
      now(),
      code,
      retryAt,
      pause,
    );
    return {
      status: !saved
        ? ("FENCED" as const)
        : pause
          ? ("PAUSED" as const)
          : ("RETRY_PENDING" as const),
      delivery_id: row.delivery_id,
    };
  }
}
