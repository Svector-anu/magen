import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const storeFile = join(
  (global as unknown as Record<string, string>).__MAGEN_TEST_DATA_DIR__,
  "contacts.json"
);

function clearStore() {
  if (existsSync(storeFile)) writeFileSync(storeFile, "[]", "utf8");
}

import {
  listContacts,
  upsertContact,
  findByIdentifier,
  deleteContact,
} from "../store/contactStore.js";

beforeEach(() => {
  clearStore();
});

describe("contactStore", () => {
  it("listContacts returns empty array on fresh store", () => {
    // #given a cleared store
    // #when
    const result = listContacts();

    // #then
    expect(result).toEqual([]);
  });

  it("upsertContact creates a contact visible in listContacts", () => {
    // #given
    upsertContact({
      display_name: "Alice",
      resolution_status: "confirmed",
      wallet_address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
      aliases: [],
    });

    // #when
    const contacts = listContacts();

    // #then
    expect(contacts).toHaveLength(1);
    expect(contacts[0].display_name).toBe("Alice");
  });

  it("upsertContact by id updates and preserves created_at", () => {
    // #given
    const first = upsertContact({
      display_name: "Alice",
      resolution_status: "unresolved",
      aliases: [],
    });

    // #when
    const updated = upsertContact({
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
    expect(listContacts()).toHaveLength(1);
  });

  it("findByIdentifier matches by wallet_address (case-insensitive)", () => {
    // #given
    upsertContact({
      display_name: "Bob",
      resolution_status: "confirmed",
      wallet_address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
      aliases: [],
    });

    // #when
    const found = findByIdentifier("0xabcdef1234567890abcdef1234567890abcdef12");

    // #then
    expect(found?.display_name).toBe("Bob");
  });

  it("findByIdentifier matches by alias", () => {
    // #given
    upsertContact({
      display_name: "Carol",
      resolution_status: "resolved",
      aliases: ["carol.eth", "c_wallet"],
    });

    // #when
    const found = findByIdentifier("carol.eth");

    // #then
    expect(found?.display_name).toBe("Carol");
  });

  it("findByIdentifier returns undefined for unknown identifier", () => {
    // #given an empty store
    // #when / #then
    expect(findByIdentifier("nobody")).toBeUndefined();
  });

  it("deleteContact removes contact and returns true", () => {
    // #given
    const contact = upsertContact({
      display_name: "Dave",
      resolution_status: "unresolved",
      aliases: [],
    });

    // #when
    const deleted = deleteContact(contact.id);

    // #then
    expect(deleted).toBe(true);
    expect(listContacts()).toHaveLength(0);
  });

  it("deleteContact returns false for unknown id", () => {
    // #when / #then
    expect(deleteContact("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("upsertContact throws when wallet address is malformed", () => {
    // #when / #then
    expect(() =>
      upsertContact({
        display_name: "Eve",
        resolution_status: "confirmed",
        wallet_address: "0xBAD",
        aliases: [],
      })
    ).toThrow();
  });
});
