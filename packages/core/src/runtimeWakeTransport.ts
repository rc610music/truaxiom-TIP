import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { RuntimeError } from "./runtimeContracts";
import type { WakeEnvelope } from "./runtimeWakeDispatcher";

export interface WakeBinding { agent_id: string; comms_recipient: string; url: string; token_env: string }
/** Host-owned transport bindings only; these do not register capabilities or authorize work. */
export function readWakeBindings(value?: string): WakeBinding[] {
  if (!value) return [];
  const rows: unknown = JSON.parse(value);
  if (!Array.isArray(rows) || rows.length > 16) throw new Error("Invalid wake bindings");
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || Object.keys(row).sort().join(",") !== "agent_id,comms_recipient,token_env,url" ||
        typeof row.agent_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.agent_id) ||
        typeof row.comms_recipient !== "string" || !/^(?:CHATGPT_WORK|CHATGPT|TIP|GEMINI|SUPERGROK|GROKBOT_[A-Z0-9]+)$/.test(row.comms_recipient) ||
        typeof row.token_env !== "string" || !/^TIP_WAKE_TOKEN_[A-Z0-9_]+$/.test(row.token_env) ||
        typeof row.url !== "string" || ids.has(row.agent_id)) throw new Error("Invalid wake bindings");
    const url = new URL(row.url);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        (url.port && url.port !== "443") || isIP(url.hostname) || !url.hostname.includes(".") || url.hostname.endsWith(".") ||
        !/^[a-z0-9.-]+$/.test(url.hostname)) throw new Error("Invalid wake endpoint");
    ids.add(row.agent_id);
  }
  return rows;
}
export function publicWakeAddress(address: string) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
/** HTTPS only, public IPv4 DNS pinning, no redirects, bounded send, and no response body trust. */
export function createHttpsWakeSender(binding: WakeBinding, env: NodeJS.ProcessEnv = process.env) {
  readWakeBindings(JSON.stringify([binding]));
  const token = env[binding.token_env];
  if (!token || /[\r\n]/.test(token)) throw new Error("Wake recipient credential unavailable");
  const url = new URL(binding.url);
  return async (envelope: WakeEnvelope, signal: AbortSignal) => {
    if (envelope.runtime_agent_id !== binding.agent_id || envelope.recipient !== binding.comms_recipient) throw new RuntimeError(403, "Wake recipient binding mismatch");
    let abort: () => void = () => {};
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true, family: 4 }),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new RuntimeError(408, "Wake DNS timeout"));
        if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
      }),
    ]).finally(() => signal.removeEventListener("abort", abort));
    if (!addresses.length || addresses.some(a => !publicWakeAddress(a.address))) throw new RuntimeError(403, "Wake DNS boundary denied");
    if (signal.aborted) throw new RuntimeError(408, "Wake delivery timeout");
    const body = JSON.stringify(envelope);
    if (Buffer.byteLength(body) > 8192) throw new RuntimeError(400, "Wake envelope too large");
    await new Promise<void>((resolve, reject) => {
      const req = request(url, {
        method: "POST", signal, agent: false,
        lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Idempotency-Key": envelope.wake_id },
      }, response => {
        const status = response.statusCode ?? 502;
        response.destroy();
        if (status >= 200 && status < 300) resolve();
        else reject(new RuntimeError(status, "Wake recipient refused delivery"));
      });
      req.on("error", () => reject(new RuntimeError(signal.aborted ? 408 : 503, "Wake transport unavailable")));
      req.end(body);
    });
  };
}
