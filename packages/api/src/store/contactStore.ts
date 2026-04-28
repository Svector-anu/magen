import { randomUUID } from "crypto";
import { ContactSchema, type Contact } from "@magen/shared";
import { getDb } from "../services/db.js";

type ContactRow = {
  id: string;
  display_name: string;
  aliases: string;
  email: string | null;
  ens_name: string | null;
  wallet_address: string | null;
  resolution_status: string;
  created_at: string;
  updated_at: string;
};

function rowToContact(row: ContactRow): Contact {
  return ContactSchema.parse({
    ...row,
    email: row.email ?? undefined,
    ens_name: row.ens_name ?? undefined,
    wallet_address: row.wallet_address ?? undefined,
    aliases: JSON.parse(row.aliases) as string[],
  });
}

export function listContacts(): Contact[] {
  const rows = getDb()
    .prepare("SELECT * FROM contacts ORDER BY display_name ASC")
    .all() as ContactRow[];
  return rows.map(rowToContact);
}

export function getContact(id: string): Contact | undefined {
  const row = getDb()
    .prepare("SELECT * FROM contacts WHERE id = ?")
    .get(id) as ContactRow | undefined;
  return row ? rowToContact(row) : undefined;
}

export function findByIdentifier(identifier: string): Contact | undefined {
  const lower = identifier.toLowerCase();
  const row = getDb()
    .prepare(`
      SELECT * FROM contacts
      WHERE lower(wallet_address) = ?
         OR lower(ens_name) = ?
         OR lower(email) = ?
         OR lower(display_name) = ?
      LIMIT 1
    `)
    .get(lower, lower, lower, lower) as ContactRow | undefined;

  if (row) return rowToContact(row);

  // aliases are stored as JSON — scan in application code
  const allRows = getDb()
    .prepare("SELECT * FROM contacts")
    .all() as ContactRow[];

  const byAlias = allRows.find((r) =>
    (JSON.parse(r.aliases) as string[]).some((a) => a.toLowerCase() === lower)
  );
  return byAlias ? rowToContact(byAlias) : undefined;
}

export function upsertContact(
  data: Omit<Contact, "id" | "created_at" | "updated_at"> & { id?: string }
): Contact {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = data.id
    ? (db.prepare("SELECT * FROM contacts WHERE id = ?").get(data.id) as ContactRow | undefined)
    : undefined;

  const contact = ContactSchema.parse({
    ...data,
    id: existing?.id ?? data.id ?? randomUUID(),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  db.prepare(`
    INSERT INTO contacts (id, display_name, aliases, email, ens_name, wallet_address, resolution_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name      = excluded.display_name,
      aliases           = excluded.aliases,
      email             = excluded.email,
      ens_name          = excluded.ens_name,
      wallet_address    = excluded.wallet_address,
      resolution_status = excluded.resolution_status,
      updated_at        = excluded.updated_at
  `).run(
    contact.id,
    contact.display_name,
    JSON.stringify(contact.aliases),
    contact.email ?? null,
    contact.ens_name ?? null,
    contact.wallet_address ?? null,
    contact.resolution_status,
    contact.created_at,
    contact.updated_at,
  );

  return contact;
}

export function deleteContact(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM contacts WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
