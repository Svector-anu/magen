import { Router, type Request, type Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { parseInstruction } from "../services/parseInstruction.js";

export const parseRouter = Router();

const parseLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.PARSE_RATE_LIMIT ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const RequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
});

parseRouter.post("/parse-instruction", parseLimiter, async (req: Request, res: Response) => {
  const body = RequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: "Invalid request",
      issues: body.error.issues,
    });
    return;
  }

  try {
    const result = await parseInstruction(body.data.instruction);

    if (result.validationErrors) {
      res.status(422).json({
        error: result.recipientUnresolved
          ? "recipient_unresolved"
          : "validation_failed",
        validationErrors: result.validationErrors,
        enrichment: result.enrichment,
        recipientDisplayName: result.recipientDisplayName,
      });
      return;
    }

    res.json({
      policy: result.policy,
      enrichment: result.enrichment,
      recipientResolutionSource: result.recipientResolutionSource,
    });
  } catch (err) {
    console.error("[parse-instruction] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
