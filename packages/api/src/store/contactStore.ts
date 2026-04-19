import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { randomUUID } from "crypto";
import { ContactSchema, type Contact } from "@magen/shared";

const DATA_DIR = resolve(import.meta.dirname, "../../data");
const STORE_PATH = resolve(DATA_DIR, "contacts.json");

function ensureStore(): Contact[] {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, "[]", "utf8");
  return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Contact[];
}

function flush(contacts: Contact[]): void {
  writeFileSync(STORE_PATH, JSON.stringify(contacts, null, 2), "utf8");
}

export function listContacts(): Contact[] {
  return ensureStore();
}

export function getContact(id: string): Contact | undefined {
  return ensureStore().find((c) => c.id === id);
}

export function findByIdentifier(identifier: string): Contact | undefined {
  const lower = identifier.toLowerCase();
  return ensureStore().find(
    (c) =>
      c.id === identifier ||
      c.wallet_address?.toLowerCase() === lower ||
      c.ens_name?.toLowerCase() === lower ||
      c.email?.toLowerCase() === lower ||
      c.display_name.toLowerCase() === lower ||
      c.aliases.some((a) => a.toLowerCase() === lower)
  );
}

export function upsertContact(data: Omit<Contact, "id" | "created_at" | "updated_at"> & { id?: string }): Contact {
  const contacts = ensureStore();
  const now = new Date().toISOString();
  const existing = data.id ? contacts.find((c) => c.id === data.id) : undefined;

  const contact = ContactSchema.parse({
    ...data,
    id: existing?.id ?? data.id ?? randomUUID(),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  if (existing) {
    const idx = contacts.findIndex((c) => c.id === contact.id);
    contacts[idx] = contact;
  } else {
    contacts.push(contact);
  }

  flush(contacts);
  return contact;
}

export function deleteContact(id: string): boolean {
  const contacts = ensureStore();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  contacts.splice(idx, 1);
  flush(contacts);
  return true;
}
