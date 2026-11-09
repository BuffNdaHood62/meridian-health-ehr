import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CHART_TAB_NAMES, getDefaultChartTab, saveDefaultChartTab } from "./preferences";

function stubStorage(available: boolean) {
  const map = new Map<string, string>();
  const store = available
    ? {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => { map.set(k, v); },
        removeItem: (k: string) => { map.delete(k); },
      }
    : {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("denied"); },
        removeItem: () => {},
      };
  vi.stubGlobal("localStorage", store);
}

describe("default chart tab preference", () => {
  beforeEach(() => stubStorage(true));
  afterEach(() => vi.unstubAllGlobals());

  it("is unset until the clinician picks a tab", () => {
    expect(getDefaultChartTab()).toBeNull();
  });

  it("round-trips the chosen tab", () => {
    expect(saveDefaultChartTab("Labs")).toBe(true);
    expect(getDefaultChartTab()).toBe("Labs");
  });

  it("only offers tabs that exist on the chart", () => {
    for (const tab of ["Overview", "Vitals", "Medications", "Labs"]) {
      expect(CHART_TAB_NAMES).toContain(tab);
    }
  });

  it("reports failure instead of pretending when storage is denied", () => {
    stubStorage(false);
    expect(saveDefaultChartTab("Vitals")).toBe(false);
    expect(getDefaultChartTab()).toBeNull();
  });
});
