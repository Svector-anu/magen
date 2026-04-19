import type { DisbursementPolicy } from "@magen/shared";

export function computeDeadline(policy: DisbursementPolicy): number {
  if (policy.approval_mode === "approve-for-period" && policy.approval_period_end) {
    return Math.floor(new Date(policy.approval_period_end).getTime() / 1000);
  }
  if (policy.approval_mode === "continue-until-revoked") {
    return Math.floor(new Date("2099-01-01T00:00:00Z").getTime() / 1000);
  }
  if (policy.end_date) {
    return Math.floor(new Date(policy.end_date).getTime() / 1000);
  }
  return Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
}

export function deadlineLabel(policy: DisbursementPolicy): string {
  if (policy.approval_mode === "continue-until-revoked") return "until revoked";
  const ts = computeDeadline(policy);
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
