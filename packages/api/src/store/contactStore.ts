import { randomUUID } from "crypto";
import { ContactSchema, type Contact } from "@magen/shared";
import { sql } from "../services/db.js";

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

export async function listContacts(): Promise<Contact[]> {
  const rows = await sql<ContactRow[]>`SELECT * FROM contacts ORDER BY display_name ASC`;
  return rows.map(rowToContact);
}

export async function getContact(id: string): Promise<Contact | undefined> {
  const rows = await sql<ContactRow[]>`SELECT * FROM contacts WHERE id = ${id}`;
  return rows[0] ? rowToContact(rows[0]) : undefined;
}

export async function findByIdentifier(identifier: string): Promise<Contact | undefined> {
  const lower = identifier.toLowerCase();
  const rows = await sql<ContactRow[]>`
    SELECT * FROM contacts
    WHERE lower(wallet_address) = ${lower}
       OR lower(ens_name) = ${lower}
       OR lower(email) = ${lower}
       OR lower(display_name) = ${lower}
    LIMIT 1
  `;
  if (rows[0]) return rowToContact(rows[0]);

  const all = await sql<ContactRow[]>`SELECT * FROM contacts`;
  const byAlias = all.find((r) =>
    (JSON.parse(r.aliases) as string[]).some((a) => a.toLowerCase() === lower)
  );
  return byAlias ? rowToContact(byAlias) : undefined;
}

export async function upsertContact(
  data: Omit<Contact, "id" | "created_at" | "updated_at"> & { id?: string }
): Promise<Contact> {
  const now = new Date().toISOString();

  const existing = data.id
    ? (await sql<ContactRow[]>`SELECT * FROM contacts WHERE id = ${data.id}`)[0]
    : undefined;

  const contact = ContactSchema.parse({
    ...data,
    id: existing?.id ?? data.id ?? randomUUID(),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  await sql`
    INSERT INTO contacts (id, display_name, aliases, email, ens_name, wallet_address, resolution_status, created_at, updated_at)
    VALUES (
      ${contact.id}, ${contact.display_name}, ${JSON.stringify(contact.aliases)},
      ${contact.email ?? null}, ${contact.ens_name ?? null}, ${contact.wallet_address ?? null},
      ${contact.resolution_status}, ${contact.created_at}, ${contact.updated_at}
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name      = EXCLUDED.display_name,
      aliases           = EXCLUDED.aliases,
      email             = EXCLUDED.email,
      ens_name          = EXCLUDED.ens_name,
      wallet_address    = EXCLUDED.wallet_address,
      resolution_status = EXCLUDED.resolution_status,
      updated_at        = EXCLUDED.updated_at
  `;

  return contact;
}

export async function deleteContact(id: string): Promise<boolean> {
  const result = await sql`DELETE FROM contacts WHERE id = ${id}`;
  return result.count > 0;
}
