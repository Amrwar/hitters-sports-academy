import { describe, expect, it } from "vitest";
import { addDaysISO, dayOfWeekISO, hhmmToMinutes, localInputToUtc, minutesToHHMM, tzOffsetMinutes, utcToLocalInput, utcToZoned, zonedToUtc } from "@/lib/time";

describe("timezone helpers", () => {
  it("converts Cairo wall-clock to UTC in winter and summer", () => {
    // Egypt: UTC+2 standard, UTC+3 daylight (last Friday of April to last Thursday of October).
    expect(zonedToUtc("2026-01-15", 19 * 60, "Africa/Cairo").toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(zonedToUtc("2026-07-15", 19 * 60, "Africa/Cairo").toISOString()).toBe("2026-07-15T16:00:00.000Z");
    expect(tzOffsetMinutes("Africa/Cairo", new Date("2026-01-15T12:00:00Z"))).toBe(120);
    expect(tzOffsetMinutes("Africa/Cairo", new Date("2026-07-15T12:00:00Z"))).toBe(180);
  });

  it("round-trips through utcToZoned", () => {
    const at = zonedToUtc("2026-10-02", 21 * 60 + 30, "Africa/Cairo");
    const z = utcToZoned(at, "Africa/Cairo");
    expect(z).toEqual({ dateISO: "2026-10-02", minutes: 21 * 60 + 30, dayOfWeek: 5 });
    const ny = utcToZoned(at, "America/New_York");
    expect(ny.dateISO).toBe("2026-10-02");
    expect(ny.minutes).toBe(14 * 60 + 30); // Cairo UTC+3 vs New York UTC-4 in early October
  });

  it("handles midnight-crossing minutes and day arithmetic", () => {
    expect(zonedToUtc("2026-03-01", 24 * 60, "Africa/Cairo").toISOString()).toBe("2026-03-01T22:00:00.000Z");
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysISO("2024-02-28", 1)).toBe("2024-02-29");
    expect(dayOfWeekISO("2026-10-04")).toBe(0); // Sunday
    expect(dayOfWeekISO("2026-10-03")).toBe(6); // Saturday
  });

  it("parses and formats datetime-local values in a zone", () => {
    const at = localInputToUtc("2026-11-20T09:15", "Asia/Dubai"); // UTC+4, no DST
    expect(at.toISOString()).toBe("2026-11-20T05:15:00.000Z");
    expect(utcToLocalInput(at, "Asia/Dubai")).toBe("2026-11-20T09:15");
    expect(utcToLocalInput(at, "Europe/London")).toBe("2026-11-20T05:15");
  });

  it("formats minutes", () => {
    expect(minutesToHHMM(7 * 60)).toBe("07:00");
    expect(minutesToHHMM(24 * 60)).toBe("00:00");
    expect(hhmmToMinutes("21:30")).toBe(1290);
    expect(() => hhmmToMinutes("nope")).toThrow();
  });
});
