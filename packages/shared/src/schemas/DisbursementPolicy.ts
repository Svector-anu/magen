import { z } from "zod";

export const ApprovalModeSchema = z.enum([
  "ask-every-time",
  "approve-for-period",
  "continue-until-revoked",
]);

export const FrequencySchema = z.enum(["once", "daily", "weekly", "monthly"]);

export const DisbursementPolicySchema = z.object({
  id: z.string().uuid(),

  recipient_wallet: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),

  recipient_display_name: z.string(),

  amount_usdc: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, "Must be a decimal string with up to 6 dp"),

  frequency: FrequencySchema,

  start_date: z.string().datetime(),

  end_date: z.string().datetime().nullish().transform(v => v ?? undefined),

  approval_mode: ApprovalModeSchema,

  approval_period_end: z.string().datetime().nullish().transform(v => v ?? undefined),

  memo: z.string().max(280).nullish().transform(v => v ?? undefined),

  created_at: z.string().datetime(),
}).superRefine((val, ctx) => {
  if (val.approval_mode === "approve-for-period" && !val.approval_period_end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "approval_period_end required when approval_mode is approve-for-period",
      path: ["approval_period_end"],
    });
  }
  if (val.end_date && val.end_date <= val.start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "end_date must be after start_date",
      path: ["end_date"],
    });
  }
});

export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;
export type Frequency = z.infer<typeof FrequencySchema>;
export type DisbursementPolicy = z.infer<typeof DisbursementPolicySchema>;
