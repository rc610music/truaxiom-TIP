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
      setStatus(
        data.missions.length
          ? "Mission states loaded."
          : "No missions recorded. No execution agents are activated by this release.",
      );
    } catch (error) {
      setMissions([]);
      setSource("");
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
        <p className="eyebrow">Taxis · Runtime 002</p>
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
    </article>
  );
}
