import { describe, expect, it, beforeEach } from "vitest";
import {
  signupAccount,
  verifyCredentials,
  findAccountByEmail,
  type Account,
} from "./users";

// Minimal localStorage shim so the demo account store works under node.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
});

describe("signupAccount", () => {
  it("rejects a short password", async () => {
    const r = await signupAccount({ name: "A B", email: "a@b.co", role: "nurse", password: "short" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/10 characters/i);
  });

  it("rejects an invalid email", async () => {
    const r = await signupAccount({ name: "A B", email: "not-an-email", role: "nurse", password: "longenough12" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/valid email/i);
  });

  it("rejects a common weak password", async () => {
    const r = await signupAccount({ name: "A B", email: "a@b.co", role: "nurse", password: "1234567890" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/common password/i);
  });

  it("rejects a duplicate email (case-insensitive)", async () => {
    await signupAccount({ name: "A B", email: "A@B.co", role: "nurse", password: "longenough12" });
    const r = await signupAccount({ name: "C D", email: "a@b.co", role: "doctor", password: "longenough34" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/i);
  });

  it("creates an account with a password hash and returns it", async () => {
    const r = await signupAccount({ name: "Jane Doe", email: "jane@b.co", role: "doctor", password: "longenough12" });
    expect(r.ok).toBe(true);
    const acc = r.account as Account;
    expect(acc.email).toBe("jane@b.co");
    expect(acc.role).toBe("doctor");
    expect(acc.verified).toBe(false);
    expect(acc.pwHash).not.toBe("longenough12"); // stored hashed, never plaintext
    expect(acc.pwHash.length).toBeGreaterThan(20);
  });
});

describe("verifyCredentials", () => {
  it("returns the account for correct credentials", async () => {
    await signupAccount({ name: "Jane Doe", email: "jane@b.co", role: "doctor", password: "longenough12" });
    const acc = await verifyCredentials("jane@b.co", "longenough12");
    expect(acc?.id).toBeDefined();
  });

  it("returns null for a wrong password", async () => {
    await signupAccount({ name: "Jane Doe", email: "jane@b.co", role: "doctor", password: "longenough12" });
    expect(await verifyCredentials("jane@b.co", "wrongpass123")).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    expect(await verifyCredentials("nobody@b.co", "longenough12")).toBeNull();
  });
});

describe("findAccountByEmail", () => {
  it("is case-insensitive", async () => {
    await signupAccount({ name: "Jane Doe", email: "Jane@B.co", role: "doctor", password: "longenough12" });
    expect(findAccountByEmail("jane@b.co")?.email).toBe("jane@b.co");
  });
});
