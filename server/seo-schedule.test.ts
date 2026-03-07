/**
 * Tests for SEO Auto-Run Multi-Day Scheduling
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateNextRun, calculateNextRunMultiDay } from "./routers/seo-automation";

describe("calculateNextRun (single day)", () => {
  it("should return a Date", () => {
    const result = calculateNextRun(1, 3);
    expect(result).toBeInstanceOf(Date);
  });

  it("should set the correct UTC hour", () => {
    const result = calculateNextRun(1, 15);
    expect(result.getUTCHours()).toBe(15);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it("should return a future date", () => {
    const result = calculateNextRun(1, 3);
    // Should be within the next 7 days
    const now = new Date();
    const diff = result.getTime() - now.getTime();
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 60000); // 7 days + 1 min buffer
  });

  it("should return the correct day of week", () => {
    const result = calculateNextRun(3, 10); // Wednesday
    expect(result.getUTCDay()).toBe(3);
  });
});

describe("calculateNextRunMultiDay", () => {
  it("should return a Date", () => {
    const result = calculateNextRunMultiDay([1, 3, 5], 3);
    expect(result).toBeInstanceOf(Date);
  });

  it("should set the correct UTC hour", () => {
    const result = calculateNextRunMultiDay([1, 2, 4, 5], 14);
    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it("should return a future date", () => {
    const result = calculateNextRunMultiDay([0, 1, 2, 3, 4, 5, 6], 3);
    const now = new Date();
    expect(result.getTime()).toBeGreaterThan(now.getTime() - 60000); // Allow 1 min tolerance
  });

  it("should pick the nearest day from the array", () => {
    // When all 7 days are selected, the next run should be today or tomorrow
    const result = calculateNextRunMultiDay([0, 1, 2, 3, 4, 5, 6], 23);
    const now = new Date();
    const diffDays = (result.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeLessThanOrEqual(1.1); // Should be within ~1 day
  });

  it("should return a day that is in the selected days array", () => {
    const days = [1, 3, 5]; // Mon, Wed, Fri
    const result = calculateNextRunMultiDay(days, 3);
    expect(days).toContain(result.getUTCDay());
  });

  it("should fallback to Monday when empty array is passed", () => {
    const result = calculateNextRunMultiDay([], 3);
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCDay()).toBe(1); // Monday
  });

  it("should handle single day array same as calculateNextRun", () => {
    const multiResult = calculateNextRunMultiDay([4], 10);
    const singleResult = calculateNextRun(4, 10);
    // Both should return Thursday at 10:00 UTC
    expect(multiResult.getUTCDay()).toBe(singleResult.getUTCDay());
    expect(multiResult.getUTCHours()).toBe(singleResult.getUTCHours());
  });

  it("should handle weekend-only schedule", () => {
    const result = calculateNextRunMultiDay([0, 6], 12); // Sat, Sun
    expect([0, 6]).toContain(result.getUTCDay());
    expect(result.getUTCHours()).toBe(12);
  });

  it("should handle weekday-only schedule (Mon-Fri)", () => {
    const result = calculateNextRunMultiDay([1, 2, 3, 4, 5], 8);
    expect([1, 2, 3, 4, 5]).toContain(result.getUTCDay());
    expect(result.getUTCHours()).toBe(8);
  });

  it("should handle 4-day schedule (default recommended)", () => {
    const result = calculateNextRunMultiDay([1, 2, 4, 5], 3); // Mon, Tue, Thu, Fri
    expect([1, 2, 4, 5]).toContain(result.getUTCDay());
  });
});

describe("Multi-day schedule edge cases", () => {
  it("should not return a date more than 7 days away", () => {
    const days = [0]; // Only Sunday
    const result = calculateNextRunMultiDay(days, 0);
    const now = new Date();
    const diffMs = result.getTime() - now.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });

  it("should handle midnight (hour 0) correctly", () => {
    const result = calculateNextRunMultiDay([1, 3, 5], 0);
    expect(result.getUTCHours()).toBe(0);
  });

  it("should handle late night (hour 23) correctly", () => {
    const result = calculateNextRunMultiDay([1, 3, 5], 23);
    expect(result.getUTCHours()).toBe(23);
  });
});
