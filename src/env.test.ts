import { describe, expect, it } from "vitest";
import { modeProblems, resolveMode } from "./env";

describe("resolveMode", () => {
  it("honours an explicitly requested mode", () => {
    expect(resolveMode("demo", false)).toBe("demo");
    expect(resolveMode("production", true)).toBe("production");
  });

  it("defaults to demo in dev and production in a build", () => {
    expect(resolveMode("", true)).toBe("demo");
    expect(resolveMode("", false)).toBe("production");
  });

  it("does not treat an unrecognized mode string as a demo grant", () => {
    expect(resolveMode("staging", false)).toBe("production");
    expect(resolveMode("DEMO", false)).toBe("production");
  });
});

describe("modeProblems", () => {
  it("blocks a production bundle that has no backend", () => {
    expect(modeProblems("production", false)).toHaveLength(1);
  });

  it("boots once the backend is configured", () => {
    expect(modeProblems("production", true)).toEqual([]);
  });

  it("leaves demo mode unblocked with no backend", () => {
    expect(modeProblems("demo", false)).toEqual([]);
  });
});
