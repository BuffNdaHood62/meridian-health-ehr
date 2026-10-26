import { describe, expect, it } from "vitest";
import { ANONYMOUS, identityReducer, isPending, isSignedIn, type IdentitySnapshot } from "./state";
import { USERS } from "../users";

const user = USERS[0];
const email = "jane@example.org";

function active(): IdentitySnapshot {
  return identityReducer(ANONYMOUS, { type: "signed_in", user, email });
}

describe("identityReducer", () => {
  it("starts anonymous", () => {
    expect(ANONYMOUS).toEqual({ status: "anonymous", user: null, email: null, reason: null });
    expect(isSignedIn(ANONYMOUS)).toBe(false);
    expect(isPending(ANONYMOUS)).toBe(false);
  });

  it("password accepted with a second factor pending", () => {
    const next = identityReducer(ANONYMOUS, { type: "mfa_challenge", email });
    expect(next).toMatchObject({ status: "password_ok", email, user: null, reason: null });
    expect(isPending(next)).toBe(true);
    expect(isSignedIn(next)).toBe(false);
  });

  it("signs in as active", () => {
    const next = active();
    expect(next).toMatchObject({ status: "active", user, email, reason: null });
    expect(isSignedIn(next)).toBe(true);
    expect(isPending(next)).toBe(false);
  });

  it("records a pending approval with the adapter message", () => {
    const next = identityReducer(ANONYMOUS, {
      type: "approval_required",
      email,
      reason: "Waiting for an administrator.",
    });
    expect(next).toMatchObject({
      status: "unverified",
      email,
      user: null,
      reason: "Waiting for an administrator.",
    });
    expect(isPending(next)).toBe(true);
    expect(isSignedIn(next)).toBe(false);
  });

  it("only asks for step-up from a signed-in state", () => {
    expect(identityReducer(ANONYMOUS, { type: "step_up_required", reason: "stale" })).toBe(ANONYMOUS);

    const gated = identityReducer(active(), { type: "step_up_required", reason: "stale" });
    expect(gated).toMatchObject({ status: "step_up_required", user, reason: "stale" });
    expect(isSignedIn(gated)).toBe(true);
  });

  it("expires the session but keeps the email for the sign-in screen", () => {
    const expired = identityReducer(active(), { type: "session_expired", reason: "Session ended." });
    expect(expired).toMatchObject({
      status: "expired",
      user: null,
      email,
      reason: "Session ended.",
    });
    expect(isSignedIn(expired)).toBe(false);
  });

  it("resets on sign-out", () => {
    expect(identityReducer(active(), { type: "signed_out" })).toEqual(ANONYMOUS);
  });
});
