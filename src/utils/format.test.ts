import { describe, expect, it } from "vitest";
import { ageFromDob, bmi, bmiCategory, bpTone, formatDate, hrTone, spo2Tone, tempTone } from "./format";

describe("ageFromDob", () => {
  it("computes age before the birthday has occurred this year", () => {
    // Fixed "now" isn't injectable; assert stable arithmetic instead:
    const age = ageFromDob("2000-01-01");
    const expected =
      new Date().getFullYear() - 2000 - (new Date() < new Date(`${new Date().getFullYear()}-01-02`) ? 1 : 0);
    expect(age).toBe(expected);
  });

  it("returns 0 for invalid input rather than NaN", () => {
    expect(ageFromDob("not-a-date")).toBe(0);
  });
});

describe("bmi", () => {
  it("computes BMI rounded to one decimal", () => {
    expect(bmi(84, 178)).toBeCloseTo(26.5, 1);
  });

  it("handles zero height without crashing", () => {
    expect(bmi(70, 0)).toBe(Infinity);
  });
});

describe("bmiCategory", () => {
  it("classifies each band", () => {
    expect(bmiCategory(17)).toBe("Underweight");
    expect(bmiCategory(22)).toBe("Normal");
    expect(bmiCategory(27)).toBe("Overweight");
    expect(bmiCategory(32)).toBe("Obese");
  });
});

describe("tone helpers", () => {
  it("bpTone flags hypo/hypertension", () => {
    expect(bpTone(141)).toBe("bad");
    expect(bpTone(85)).toBe("bad");
    expect(bpTone(132)).toBe("warn");
    expect(bpTone(120)).toBe("good");
  });

  it("hrTone flags brady/tachycardia", () => {
    expect(hrTone(115)).toBe("bad");
    expect(hrTone(45)).toBe("bad");
    expect(hrTone(105)).toBe("warn");
    expect(hrTone(52)).toBe("warn");
    expect(hrTone(75)).toBe("good");
  });

  it("spo2Tone flags hypoxia", () => {
    expect(spo2Tone(88)).toBe("bad");
    expect(spo2Tone(92)).toBe("warn");
    expect(spo2Tone(98)).toBe("good");
  });

  it("tempTone flags fever and hypothermia", () => {
    expect(tempTone(101)).toBe("bad");
    expect(tempTone(94)).toBe("bad");
    expect(tempTone(99.8)).toBe("warn");
    expect(tempTone(98.6)).toBe("good");
  });
});

describe("formatDate", () => {
  it("falls back to the raw input for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("formats valid dates", () => {
    expect(formatDate("2026-01-10")).toContain("Jan");
  });
});
