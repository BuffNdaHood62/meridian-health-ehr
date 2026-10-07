import { describe, it, expect } from "vitest";
import { nextWwwNumber, wwwNumberForClient, groupClients, clientRecordText } from "./wwwRecords";
import type { WwwVisitEntry } from "../types";

const mk = (wwwNumber: string, clientName: string, visitAt: string): WwwVisitEntry => ({
  id: `w-${wwwNumber}-${visitAt}`,
  wwwNumber,
  clientName,
  ageBand: "Above 20 years",
  facility: "WWW Clinic Uyo",
  status: "Admitted",
  complaints: "headache",
  allergies: "none reported",
  vitals: { tempC: 37, spo2Pct: 97, bpSys: 120, bpDia: 80, pulseBpm: 72, respRate: 16, weightKg: 70, heightCm: 175 },
  visitAt,
  savedAt: visitAt,
});

describe("nextWwwNumber", () => {
  it("starts at 001 with an empty registry", () => {
    expect(nextWwwNumber([])).toBe("001");
  });
  it("is zero-padded and increments past the max", () => {
    expect(nextWwwNumber([mk("009", "A", "2026-01-01"), mk("002", "B", "2026-01-02")])).toBe("010");
  });
  it("throws when the 001-999 pool is exhausted", () => {
    expect(() => nextWwwNumber([mk("999", "A", "2026-01-01")])).toThrow(/exhausted/);
  });
});

describe("wwwNumberForClient", () => {
  it("reuses an existing client's number (case/whitespace-insensitive)", () => {
    const entries = [mk("003", "Grace Etim", "2026-01-01")];
    expect(wwwNumberForClient(entries, "  grace etim ")).toBe("003");
  });
  it("assigns the next free number to a new client", () => {
    const entries = [mk("001", "A", "2026-01-01"), mk("002", "B", "2026-01-02")];
    expect(wwwNumberForClient(entries, "New Person")).toBe("003");
  });
});

describe("groupClients", () => {
  it("collapses visits per client, newest first, sorted by number", () => {
    const groups = groupClients([
      mk("002", "B", "2026-01-01"),
      mk("001", "A", "2026-02-01"),
      mk("001", "A", "2026-03-01"),
    ]);
    expect(groups.map((g) => g.wwwNumber)).toEqual(["001", "002"]);
    expect(groups[0].visits).toBe(2);
    expect(groups[0].latest.visitAt).toBe("2026-03-01");
  });
});

describe("clientRecordText", () => {
  it("renders all record fields for print/mail export", () => {
    const text = clientRecordText(mk("001", "Adebayo Okonkwo", "2026-09-12T09:00:00.000Z"));
    expect(text).toContain("WWW 001 — Adebayo Okonkwo");
    expect(text).toContain("Admitted");
    expect(text).toContain("headache");
    expect(text).toContain("BP 120/80 mmHg");
    expect(text).toContain("Weight 70 kg");
  });
});
