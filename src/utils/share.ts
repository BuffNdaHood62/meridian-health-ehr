// ============================================================================
// Secure share links (RFD §4.5 / §8.5)
// ============================================================================

// ponytail: localStorage share registry = demo stand-in for server-side signed
// URLs. Same record shape; Phase-with-backend swaps storage, not call sites.

export interface ShareRecord {
  id: string;
  patientId: string;
  recipientEmail: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
}

const SHARE_KEY = "www-shares";
const TTL_HOURS = 72;

function listShares(): ShareRecord[] {
  try {
    return JSON.parse(localStorage.getItem(SHARE_KEY) ?? "[]") as ShareRecord[];
  } catch {
    return [];
  }
}

export function createShare(patientId: string, recipientEmail: string): ShareRecord {
  const rec: ShareRecord = {
    id: `sh-${crypto.randomUUID()}`,
    patientId,
    recipientEmail,
    token: crypto.randomUUID().replace(/-/g, ""),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000).toISOString(),
    consumed: false,
  };
  const list = [rec, ...listShares()];
  try {
    localStorage.setItem(SHARE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  return rec;
}

/** One-time consume: valid only if unexpired, unconsumed. Marks consumed. */
export function consumeShare(token: string): ShareRecord | null {
  const rec = listShares().find((s) => s.token === token);
  if (!rec || rec.consumed || new Date(rec.expiresAt) < new Date()) return null;
  const list = listShares().map((s) => (s.token === token ? { ...s, consumed: true } : s));
  try {
    localStorage.setItem(SHARE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return rec;
}
