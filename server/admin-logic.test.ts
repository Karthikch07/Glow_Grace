import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canMoveBooking, countByStatus, fillDailySeries, percentChange } from "./admin-logic";

describe("canMoveBooking", () => {
  it("allows the normal booking lifecycle", () => {
    assert.equal(canMoveBooking("pending_payment", "confirmed"), true);
    assert.equal(canMoveBooking("confirmed", "completed"), true);
    assert.equal(canMoveBooking("confirmed", "cancelled"), true);
  });

  it("blocks moves out of final states and skipped steps", () => {
    assert.equal(canMoveBooking("completed", "confirmed"), false);
    assert.equal(canMoveBooking("cancelled", "confirmed"), false);
    assert.equal(canMoveBooking("pending_payment", "completed"), false);
  });

  it("rejects unknown statuses", () => {
    assert.equal(canMoveBooking("nonsense", "confirmed"), false);
    assert.equal(canMoveBooking("confirmed", "nonsense"), false);
  });
});

describe("fillDailySeries", () => {
  it("returns one point per day ending on the end date, zero-filling gaps", () => {
    const series = fillDailySeries(
      "2026-03-02",
      4,
      [{ _id: "2026-02-28", count: 2, revenue: 998 }],
      [
        { _id: "2026-02-28", count: 1, revenue: 149.4 },
        { _id: "2026-03-02", count: 3, revenue: 300 },
      ],
    );
    assert.deepEqual(
      series.map((p) => p.date),
      ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"],
    );
    assert.deepEqual(series[0], { date: "2026-02-27", orders: 0, bookings: 0, revenue: 0 });
    assert.deepEqual(series[1], { date: "2026-02-28", orders: 2, bookings: 1, revenue: 1147 });
    assert.deepEqual(series[3], { date: "2026-03-02", orders: 0, bookings: 3, revenue: 300 });
  });

  it("ignores rows outside the window", () => {
    const series = fillDailySeries("2026-01-10", 2, [{ _id: "2025-12-01", count: 9, revenue: 9 }], []);
    assert.equal(series.reduce((s, p) => s + p.orders, 0), 0);
  });
});

describe("countByStatus", () => {
  it("includes every status and drops unknown ones", () => {
    const out = countByStatus(["a", "b", "c"] as const, [
      { _id: "a", count: 4 },
      { _id: "zzz", count: 7 },
    ]);
    assert.deepEqual(out, { a: 4, b: 0, c: 0 });
  });
});

describe("percentChange", () => {
  it("rounds to one decimal place", () => {
    assert.equal(percentChange(150, 100), 50);
    assert.equal(percentChange(1, 3), -66.7);
  });

  it("returns null without a baseline", () => {
    assert.equal(percentChange(10, 0), null);
  });
});
