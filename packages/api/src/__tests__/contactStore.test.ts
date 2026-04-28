import {
  listContacts,
  upsertContact,
  findByIdentifier,
  deleteContact,
} from "../store/contactStore.js";

// These tests require a live DATABASE_URL and are skipped in CI.
// Run with: DATABASE_URL=... npx jest contactStore
const runTests = !!process.env.DATABASE_URL;
const maybeIt = runTests ? it : it.skip;

describe("contactStore", () => {
  maybeIt("listContacts returns array", async () => {
    const result = await listContacts();
    expect(Array.isArray(result)).toBe(true);
  });

  maybeIt("upsertContact creates a contact visible in listContacts", async () => {
    // #given
    await upsertContact({
      display_name: "Alice",
      resolution_status: "confirmed",
      wallet_address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
      aliases: [],
    });

    // #when
    const contacts = await listContacts();

    // #then
    expect(contacts.some((c) => c.display_name === "Alice")).toBe(true);
  });

  maybeIt("upsertContact by id updates and preserves created_at", async () => {
    // #given
    const first = await upsertContact({
      display_name: "Alice",
      resolution_status: "unresolved",
      aliases: [],
    });

    // #when
    const updated = await upsertContact({
      id: first.id,
      display_name: "Alice Updated",
      resolution_status: "confirmed",
      wallet_address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
      aliases: [],
    });

    // #then
    expect(updated.id).toBe(first.id);
    expect(updated.display_name).toBe("Alice Updated");
    expect(updated.created_at).toBe(first.created_at);
  });

  maybeIt("findByIdentifier matches by wallet_address (case-insensitive)", async () => {
    // #given
    await upsertContact({
      display_name: "Bob",
      resolution_status: "confirmed",
      wallet_address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
      aliases: [],
    });

    // #when
    const found = await findByIdentifier("0xabcdef1234567890abcdef1234567890abcdef12");

    // #then
    expect(found?.display_name).toBe("Bob");
  });

  maybeIt("deleteContact removes contact and returns true", async () => {
    // #given
    const contact = await upsertContact({
      display_name: "Dave",
      resolution_status: "unresolved",
      aliases: [],
    });

    // #when
    const deleted = await deleteContact(contact.id);

    // #then
    expect(deleted).toBe(true);
  });

  maybeIt("deleteContact returns false for unknown id", async () => {
    const deleted = await deleteContact("00000000-0000-0000-0000-000000000000");
    expect(deleted).toBe(false);
  });
});
