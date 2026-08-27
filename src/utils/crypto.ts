// ============================================================================
// Demo-grade crypto scaffolding (RFD §8.1)
// ============================================================================

// ponytail: browser-native AES-GCM with a device-stored key = obfuscation, not
// real at-rest encryption. Real deployment moves this server-side (KMS-wrapped
// DEKs). API mirrors what the backend will expose so call sites don't change.

const KEY_STORAGE = "www-dek";

async function getDek(): Promise<CryptoKey> {
  let rawB64 = localStorage.getItem(KEY_STORAGE);
  if (!rawB64) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    rawB64 = btoa(String.fromCharCode(...raw));
    localStorage.setItem(KEY_STORAGE, rawB64);
  }
  const raw = Uint8Array.from(atob(rawB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypt a string; returns iv:ciphertext as base64 */
export async function encryptString(plaintext: string): Promise<string> {
  const key = await getDek();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt("AES-GCM", key, new TextEncoder().encode(plaintext));
  const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `${b64(iv.buffer)}:${b64(ct)}`;
}

/** Decrypt an iv:ciphertext base64 pair; returns null on tamper/wrong key */
export async function decryptString(payload: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = payload.split(":");
    if (!ivB64 || !ctB64) return null;
    const key = await getDek();
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** SHA-256 hex digest — used for doctor-code hashing (see ponytail note below) */
export async function sha256Hex(text: string): Promise<string> {
  // ponytail: SHA-256 stands in for Argon2id (RFD §8.1) — no browser native KDF
  // without a dependency; server-side replaces this in production.
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
