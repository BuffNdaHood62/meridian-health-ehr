import { beforeEach, describe, expect, it } from "vitest";
import { createDemoIdentityAdapter } from "./demo-adapter";
import { USERS } from "../users";
import type { IdentityAdapter } from "./adapter";

function memoryStorage(map: Map<string, string>): Storage {
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

interface StoredSession {
  sessionId: string;
  user: { id: string };
  startedAt: string;
}

let localMap: Map<string, string>;
let sessionMap: Map<string, string>;
let adapter: IdentityAdapter;

function storedSessions(): StoredSession[] {
  return JSON.parse(localMap.get("www-sessions") ?? "[]") as StoredSession[];
}

function ageCurrentSession(milliseconds: number): void {
  const sid = sessionMap.get("www-session-id");
  localMap.set(
    "www-sessions",
    JSON.stringify(
      storedSessions().map((session) =>
        session.sessionId === sid
          ? { ...session, startedAt: new Date(Date.now() - milliseconds).toISOString() }
          : session
      )
    )
  );
}

beforeEach(() => {
  localMap = new Map();
  sessionMap = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage(localMap),
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: memoryStorage(sessionMap),
    configurable: true,
  });
  adapter = createDemoIdentityAdapter();
});

describe("DemoIdentityAdapter", () => {
  it("restores to anonymous without a session", async () => {
    expect(await adapter.restore()).toEqual({ kind: "anonymous" });
  });

  it("signs in from the demo role picker and restores that session", async () => {
    const signedIn = await adapter.signInAs(USERS[1].id);
    expect(signedIn).toMatchObject({ kind: "active", user: { id: USERS[1].id } });

    const restored = await adapter.restore();
    expect(restored).toMatchObject({ kind: "active", user: { id: USERS[1].id } });
    expect(sessionMap.get("www-session-id")).toBeTruthy();
  });

  it("rejects an unknown demo account", async () => {
    expect(await adapter.signInAs("NOPE-0000")).toEqual({
      kind: "error",
      message: "Unknown demo account.",
    });
  });

  it("rejects a wrong password", async () => {
    expect(await adapter.signIn("nobody@example.org", "longenough12")).toEqual({
      kind: "error",
      message: "Invalid email or password.",
    });
  });

  it("signs up, signs out, and signs back in by email", async () => {
    const created = await adapter.signup({
      name: "Jane Doe",
      email: "jane@example.org",
      role: "doctor",
      password: "longenough12",
    });
    expect(created).toMatchObject({ kind: "active", email: "jane@example.org" });

    await adapter.signOut("local");
    expect(await adapter.restore()).toEqual({ kind: "anonymous" });

    const again = await adapter.signIn("JANE@EXAMPLE.ORG", "longenough12");
    expect(again).toMatchObject({ kind: "active", email: "jane@example.org" });
  });

  it("does not offer MFA in demo mode", async () => {
    await adapter.signInAs(USERS[0].id);
    expect(await adapter.verifyMfa("123456")).toMatchObject({ kind: "error" });
  });

  it("requires step-up after 8 hours and clears it after acknowledging", async () => {
    await adapter.signInAs(USERS[0].id);
    expect(await adapter.stepUpReason()).toBeNull();

    ageCurrentSession(9 * 3600_000);
    expect(await adapter.stepUpReason()).not.toBeNull();

    const steppedUp = await adapter.stepUp("", "");
    expect(steppedUp.kind).toBe("active");
    expect(await adapter.stepUpReason()).toBeNull();
  });

  it("expires a session older than the 12-hour retention", async () => {
    await adapter.signInAs(USERS[0].id);
    ageCurrentSession(13 * 3600_000);

    expect(await adapter.restore()).toMatchObject({ kind: "expired" });
    expect(await adapter.restore()).toEqual({ kind: "anonymous" });
    expect(sessionMap.has("www-session-id")).toBe(false);
  });

  it("removes the session and binding on sign-out", async () => {
    await adapter.signInAs(USERS[2].id);
    await adapter.signOut("local");

    expect(await adapter.restore()).toEqual({ kind: "anonymous" });
    expect(storedSessions()).toHaveLength(0);
    expect(sessionMap.has("www-session-id")).toBe(false);
  });
});
