import { computeDeadline, deadlineLabel } from "../lib/policy.js";
import type { DisbursementPolicy } from "@magen/shared";

const BASE: DisbursementPolicy = {
  id: "123e4567-e89b-12d3-a456-426614174001",
  recipient_wallet: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  recipient_display_name: "Alice",
  amount_usdc: "500.00",
  frequency: "monthly",
  start_date: "2026-01-01T00:00:00.000Z",
  approval_mode: "ask-every-time",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("computeDeadline", () => {
  it("approve-for-period: returns approval_period_end as unix seconds", () => {
    // #given
    const policy: DisbursementPolicy = {
      ...BASE,
      approval_mode: "approve-for-period",
      approval_period_end: "2026-07-01T00:00:00.000Z",
    };

    // #when
    const deadline = computeDeadline(policy);

    // #then
    expect(deadline).toBe(Math.floor(new Date("2026-07-01T00:00:00.000Z").getTime() / 1000));
  });

  it("continue-until-revoked: returns 2099 epoch", () => {
    // #given
    const policy: DisbursementPolicy = {
      ...BASE,
      approval_mode: "continue-until-revoked",
    };

    // #when
    const deadline = computeDeadline(policy);

    // #then
    expect(deadline).toBe(Math.floor(new Date("2099-01-01T00:00:00Z").getTime() / 1000));
  });

  it("ask-every-time with end_date: returns end_date as unix seconds", () => {
    // #given
    const policy: DisbursementPolicy = {
      ...BASE,
      approval_mode: "ask-every-time",
      end_date: "2026-12-31T00:00:00.000Z",
    };

    // #when
    const deadline = computeDeadline(policy);

    // #then
    expect(deadline).toBe(Math.floor(new Date("2026-12-31T00:00:00.000Z").getTime() / 1000));
  });

  it("ask-every-time without end_date: returns ~now + 7 days", () => {
    // #given
    const before = Math.floor(Date.now() / 1000);
    const policy: DisbursementPolicy = { ...BASE, approval_mode: "ask-every-time" };

    // #when
    const deadline = computeDeadline(policy);

    // #then
    const sevenDays = 7 * 24 * 3600;
    expect(deadline).toBeGreaterThanOrEqual(before + sevenDays - 1);
    expect(deadline).toBeLessThanOrEqual(before + sevenDays + 1);
  });
});

describe("deadlineLabel", () => {
  it("continue-until-revoked: returns 'until revoked'", () => {
    // #given
    const policy: DisbursementPolicy = {
      ...BASE,
      approval_mode: "continue-until-revoked",
    };

    // #when / #then
    expect(deadlineLabel(policy)).toBe("until revoked");
  });

  it("approve-for-period: returns formatted date string", () => {
    // #given
    const policy: DisbursementPolicy = {
      ...BASE,
      approval_mode: "approve-for-period",
      approval_period_end: "2026-07-01T00:00:00.000Z",
    };

    // #when
    const label = deadlineLabel(policy);

    // #then — must contain year and month
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/Jul/);
  });
});
