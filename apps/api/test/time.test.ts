import { describe, expect, it } from "vitest";

import { centerLocalDate, formatCenterDateTime } from "../src/lib/time.js";

describe("center timezone helpers", () => {
  it("computes the local calendar date for Asia/Almaty", () => {
    // 22:00 UTC = 03:00 следующего дня в Алматы (+05:00 / +06:00)
    expect(centerLocalDate("2026-06-22T22:00:00.000Z", "Asia/Almaty")).toBe("2026-06-23");
    expect(centerLocalDate("2026-06-22T10:00:00.000Z", "Asia/Almaty")).toBe("2026-06-22");
  });

  it("treats two timestamps in the same Almaty day as equal", () => {
    const tz = "Asia/Almaty";
    expect(centerLocalDate("2026-06-22T05:00:00.000Z", tz)).toBe(
      centerLocalDate("2026-06-22T16:00:00.000Z", tz)
    );
  });

  it("formats a date-time string for Almaty", () => {
    const formatted = formatCenterDateTime("2026-06-22T09:32:00.000Z", "Asia/Almaty");
    // 09:32 UTC -> 14:32 в Алматы
    expect(formatted).toContain("22.06.2026");
    expect(formatted).toContain("14:32");
  });
});
