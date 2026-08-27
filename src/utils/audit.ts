// ============================================================================
// Append-only audit log (RFD §8.3)
// ============================================================================

// ponytail: localStorage array, capped at last 500 entries. Production =
// server-side immutable table; same record shape.

export interface AuditEntry {
  id: string;
  actorId: string;
  action: "create" | "update" | "delete" | "unlock" | "sign" | "administer";
  entity: string;
  entityId: string;
  detail?: string;
  at: string;
}

const AUDIT_KEY = "www-audit-log";
const CAP = 500;

function currentSessionId(): string | null {
  try {
    return sessionStorage.getItem("www-session-id");
  } catch {
    return null;
  }
}

function currentUserRef(): string {
  // ponytail: derive actor from the live session instead of a hardcoded mock
  // user; falls back to PHY-0142 only when no session is bound (e.g. server-side).
  try {
    const sid = currentSessionId();
    if (!sid) return "PHY-0142";
    const list = JSON.parse(localStorage.getItem("www-sessions") ?? "[]") as {
      sessionId: string;
      user: { id: string };
    }[];
    return list.find((s) => s.sessionId === sid)?.user.id ?? "PHY-0142";
  } catch {
    return "PHY-0142";
  }
}

export function appendAudit(
  action: AuditEntry["action"],
  entity: string,
  entityId: string,
  detail?: string
): void {
  const entry: AuditEntry = {
    id: `aud-${crypto.randomUUID()}`,
    actorId: currentUserRef(),
    action,
    entity,
    entityId,
    detail,
    at: new Date().toISOString(),
  };
  try {
    const list = listAudit();
    list.unshift(entry);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* storage unavailable — audit lost; server-side impl must not fail silently */
  }
}

export function listAudit(): AuditEntry[] {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? "[]") as AuditEntry[];
  } catch {
    return [];
  }
}
