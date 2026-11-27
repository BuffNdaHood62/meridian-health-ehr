import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseIdentityAdapter } from "./supabase-adapter";

const mocks = vi.hoisted(() => ({
  requireSupabase: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  requireSupabase: mocks.requireSupabase,
}));

const session = {
  user: { id: "user-1", email: "jane@example.org" },
};

function clientWithProfile(profile: Record<string, unknown> | null) {
  return {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
      },
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
        })),
      })),
    })),
  };
}

describe("SupabaseIdentityAdapter signup", () => {
  beforeEach(() => {
    mocks.requireSupabase.mockReset();
  });

  it("starts an active session when signup returns a confirmed session", async () => {
    const client = clientWithProfile({
      id: "user-1",
      full_name: "Jane Doe",
      role: "doctor",
      verified: true,
      disabled_at: null,
    });
    client.auth.signUp.mockResolvedValue({ data: { session }, error: null });
    mocks.requireSupabase.mockReturnValue(client);

    const outcome = await createSupabaseIdentityAdapter().signup({
      name: "Jane Doe",
      email: "jane@example.org",
      role: "doctor",
      password: "longenough12",
    });

    expect(outcome).toMatchObject({
      kind: "active",
      user: { id: "user-1", name: "Jane Doe", role: "doctor" },
    });
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("asks for email confirmation when GoTrue returns no session", async () => {
    const client = clientWithProfile(null);
    client.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    mocks.requireSupabase.mockReturnValue(client);

    const outcome = await createSupabaseIdentityAdapter().signup({
      name: "Jane Doe",
      email: "jane@example.org",
      role: "nurse",
      password: "longenough12",
    });

    expect(outcome).toMatchObject({ kind: "error" });
    expect(outcome).toHaveProperty("message", expect.stringMatching(/check your email/i));
  });

  it("rejects an inactive profile instead of routing to an approval screen", async () => {
    const client = clientWithProfile({
      id: "user-1",
      full_name: "Jane Doe",
      role: "reception",
      verified: false,
      disabled_at: null,
    });
    client.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    mocks.requireSupabase.mockReturnValue(client);

    const outcome = await createSupabaseIdentityAdapter().signIn(
      "jane@example.org",
      "longenough12",
    );

    expect(outcome).toMatchObject({ kind: "error" });
    expect(outcome).toHaveProperty("message", expect.stringMatching(/not active/i));
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
