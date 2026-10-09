import { useRef, useState } from "react";
import { getApiBaseUrl } from "./apiClient";
import type { HandoffPacket as Packet } from "../../../packages/core/src/missionRuntimeTypes";

/** Existing operator credential is held only in component memory, never browser storage/build env. */
export function RuntimeMissions() {
  const secret = useRef("");
  const [entry, setEntry] = useState("");
  const [missions, setMissions] = useState<Packet[]>([]);
  const [status, setStatus] = useState(
    "Connect with your existing operator credential to inspect missions.",
  );
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<unknown>(null);
  const [deliveries, setDeliveries] = useState<
    Array<{
      delivery_id: string;
      mission_id: string;
      mission_revision: number;
      status: string;
      attempts: number;
      last_error_code: string | null;
    }>
  >([]);
  const [deliveryStatus, setDeliveryStatus] = useState("");
  async function inspectReport(missionId: string, sha: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/v1/runtime/missions/${encodeURIComponent(missionId)}/artifacts/${sha}`,
        {
          headers: { Authorization: `Bearer ${secret.current}` },
        },
      );
      if (!response.ok) throw new Error("Stored report unavailable.");
      setReport(await response.json());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Report unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      if (entry.trim()) {
        secret.current = entry.trim();
        setEntry("");
      }
      const response = await fetch(`${getApiBaseUrl()}/v1/runtime/missions`, {
        headers: { Authorization: `Bearer ${secret.current}` },
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Operator authentication required."
            : "Runtime unavailable. Verify database migration and API configuration.",
        );
      const data = (await response.json()) as {
        source: string;
        missions: Packet[];
      };
      setMissions(data.missions);
      setSource(data.source);
      const deliveryResponse = await fetch(
        `${getApiBaseUrl()}/v1/runtime/deliveries`,
        { headers: { Authorization: `Bearer ${secret.current}` } },
      );
      if (deliveryResponse.ok) {
        setDeliveries((await deliveryResponse.json()).deliveries);
        setDeliveryStatus("");
      } else {
        setDeliveries([]);
        setDeliveryStatus(
          "Delivery status unavailable. The API may need its additive delivery migration.",
        );
      }
      setStatus(
        data.missions.length
          ? "Mission states loaded."
          : "No missions recorded.",
      );
    } catch (error) {
      setMissions([]);
      setSource("");
      setDeliveries([]);
      setDeliveryStatus("");
      setStatus(
        error instanceof Error ? error.message : "Runtime unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel">
      <div className="panel-heading">
        <p className="eyebrow">Taxis · Mission operations</p>
        <strong>Mission lifecycle</strong>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void refresh();
        }}
      >
        <label>
          Operator credential{" "}
          <input
            type="password"
            autoComplete="off"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            aria-label="Runtime operator credential"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Loading…" : "Connect / refresh"}
        </button>
        <button
          type="button"
          onClick={() => {
            secret.current = "";
            setEntry("");
            setMissions([]);
            setSource("");
            setReport(null);
            setDeliveries([]);
            setDeliveryStatus("");
            setStatus("Disconnected.");
          }}
        >
          Disconnect
        </button>
      </form>
      <p role="status">{status}</p>
      {source && (
        <p>
          {source === "postgres"
            ? "Database-backed runtime"
            : "Memory preview · does not survive restart"}
        </p>
      )}
      <div className="stack compact">
        {missions.map((m) => (
          <div className="content-chip" key={m.mission_id}>
            <strong>
              {m.mission_id} · {m.state}
            </strong>
            <span>
              {m.project_id} · {m.assigned_agent_id ?? "Unassigned"} · revision{" "}
              {m.revision}
            </span>
            {m.review_required && <span>Operator review required</span>}
            {m.blockers.map((b, i) => (
              <p key={i}>{b}</p>
            ))}
            <span>
              {m.evidence.length} evidence references · {m.handoffs.length}{" "}
              handoffs · {m.failures.length} failures
            </span>
            {m.evidence
              .filter((e) => e.verification_level === "HASH_VERIFIED")
              .map((e) => (
                <button
                  type="button"
                  key={e.artifact_id}
                  disabled={busy}
                  onClick={() => void inspectReport(m.mission_id, e.sha256)}
                >
                  Inspect stored {e.kind}
                </button>
              ))}
            {m.completion_result && (
              <p>
                {m.state === "COMPLETED"
                  ? "Reviewed result"
                  : "Proposed result"}
                : {m.completion_result}
              </p>
            )}
          </div>
        ))}
      </div>
      {(deliveries.length > 0 || deliveryStatus) && (
        <section aria-label="Command Center delivery">
          <strong>Command Center delivery</strong>
          {deliveryStatus && <p>{deliveryStatus}</p>}
          {deliveries.map((d) => (
            <p key={d.delivery_id}>
              {d.mission_id} · revision {d.mission_revision} · {d.status} ·{" "}
              {d.attempts} attempts
              {d.last_error_code ? ` · ${d.last_error_code}` : ""}
            </p>
          ))}
        </section>
      )}
      {report !== null && (
        <details open>
          <summary>Stored evidence report</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(report, null, 2)}
          </pre>
          <button type="button" onClick={() => setReport(null)}>
            Close report
          </button>
        </details>
      )}
    </article>
  );
}
