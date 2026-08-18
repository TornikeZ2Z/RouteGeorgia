import { describe, it, expect } from "vitest";
import { divRound, applyBps, roundToStep, parseMajor, toMajorString, maxMinor } from "@/lib/money";

describe("money", () => {
  it("rounds half up, never truncating toward zero", () => {
    expect(divRound(5n, 2n)).toBe(3n);       // 2.5 -> 3
    expect(divRound(7n, 2n)).toBe(4n);       // 3.5 -> 4
    expect(divRound(4n, 2n)).toBe(2n);
    expect(divRound(1n, 3n)).toBe(0n);
    expect(divRound(2n, 3n)).toBe(1n);
  });

  it("applies basis points without floating point drift", () => {
    // 15% of 10.00 GEL is exactly 1.50, and must never be 1.4999999
    expect(applyBps(1000n, 1500)).toBe(150n);
    expect(applyBps(10_000n, 1500)).toBe(1500n);
    // A value that would lose precision in float arithmetic
    expect(applyBps(333_333_333_333n, 1500)).toBe(50_000_000_000n);
  });

  it("rounds to a configured step", () => {
    expect(roundToStep(1234n, 50)).toBe(1250n);
    expect(roundToStep(1224n, 50)).toBe(1200n);
    expect(roundToStep(1225n, 50)).toBe(1250n);
    expect(roundToStep(999n, 1)).toBe(999n);
  });

  it("parses and formats decimal money losslessly", () => {
    expect(parseMajor("12.50")).toBe(1250n);
    expect(parseMajor("0.01")).toBe(1n);
    expect(parseMajor("1")).toBe(100n);
    expect(parseMajor("1234567.89")).toBe(123456789n);
    expect(toMajorString(1250n)).toBe("12.50");
    expect(toMajorString(1n)).toBe("0.01");
    expect(toMajorString(0n)).toBe("0.00");
  });

  it("rejects anything that is not plain decimal money", () => {
    expect(() => parseMajor("1e5")).toThrow();
    expect(() => parseMajor("12,50")).toThrow();
    expect(() => parseMajor("abc")).toThrow();
    expect(() => parseMajor("")).toThrow();
  });

  it("survives amounts far beyond Number.MAX_SAFE_INTEGER", () => {
    const huge = parseMajor("99999999999999999999.99");
    expect(toMajorString(huge)).toBe("99999999999999999999.99");
    expect(maxMinor(huge, 1n)).toBe(huge);
  });
});
