import { z } from "zod";

export const ResolutionStatusSchema = z.enum([
  "unresolved",
  "resolved",
  "confirmed",
]);

export const ContactSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  email: z.string().email().optional(),
  ens_name: z.string().regex(/\.eth$/).optional(),
  wallet_address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
  resolution_status: ResolutionStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;
export type Contact = z.infer<typeof ContactSchema>;
