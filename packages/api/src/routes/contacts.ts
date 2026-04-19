import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  listContacts,
  getContact,
  upsertContact,
  deleteContact,
} from "../store/contactStore.js";
import { resolveIdentifier } from "../services/resolveIdentifier.js";

export const contactsRouter = Router();

// GET /api/contacts
contactsRouter.get("/contacts", (_req: Request, res: Response) => {
  res.json(listContacts());
});

// GET /api/contacts/:id
contactsRouter.get("/contacts/:id", (req: Request, res: Response) => {
  const contact = getContact(req.params.id);
  if (!contact) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(contact);
});

// POST /api/contacts — create or update a contact
const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  display_name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  email: z.string().email().optional(),
  ens_name: z.string().regex(/\.eth$/).optional(),
  wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  resolution_status: z.enum(["unresolved", "resolved", "confirmed"]).optional(),
});

contactsRouter.post("/contacts", (req: Request, res: Response) => {
  const body = UpsertSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request", issues: body.error.issues });
    return;
  }
  const contact = upsertContact({
    ...body.data,
    aliases: body.data.aliases ?? [],
    resolution_status: body.data.resolution_status ?? "unresolved",
  });
  res.status(201).json(contact);
});

// DELETE /api/contacts/:id
contactsRouter.delete("/contacts/:id", (req: Request, res: Response) => {
  const deleted = deleteContact(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

// POST /api/resolve-recipients — resolve a list of identifiers to contacts
const ResolveSchema = z.object({
  identifiers: z.array(z.string().min(1)).min(1).max(20),
});

contactsRouter.post(
  "/resolve-recipients",
  async (req: Request, res: Response) => {
    const body = ResolveSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", issues: body.error.issues });
      return;
    }

    const results = await Promise.all(
      body.data.identifiers.map(async (id) => ({
        identifier: id,
        ...(await resolveIdentifier(id)),
      }))
    );

    res.json({ results });
  }
);
