import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { validateEnv } from "../services/config.js";

const REQUIRED_VARS: Record<string, string> = {
  ARBITRUM_SEPOLIA_RPC: "https://rpc.example.com",
  PRIVATE_KEY: "0x" + "a".repeat(64),
  USDC_ADDRESS: "0x" + "b".repeat(40),
  WRAPPED_USDC_ADDRESS: "0x" + "c".repeat(40),
  DISBURSEMENT_VAULT_ADDRESS: "0x" + "d".repeat(40),
  DISBURSEMENT_AGENT_ADDRESS: "0x" + "e".repeat(40),
  AGENT_PUBLIC_JWK: JSON.stringify({ crv: "Ed25519", kty: "OKP", x: "test" }),
};

function setRequiredVars() {
  for (const [k, v] of Object.entries(REQUIRED_VARS)) {
    process.env[k] = v;
  }
}

function clearRequiredVars() {
  for (const key of [...Object.keys(REQUIRED_VARS), "ADMIN_TOKEN", "APP_ENV", "WEBHOOK_URL"]) {
    delete process.env[key];
  }
}

beforeEach(() => {
  clearRequiredVars();
  setRequiredVars();
});

afterEach(() => {
  clearRequiredVars();
});

describe("validateEnv", () => {
  it("passes when all required vars are present in dev", () => {
    // #given all required vars set, APP_ENV=dev
    process.env.APP_ENV = "dev";
    // #when / #then — should not throw
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws when PRIVATE_KEY is missing", () => {
    // #given
    delete process.env.PRIVATE_KEY;
    // #when / #then
    expect(() => validateEnv()).toThrow(/PRIVATE_KEY/);
  });

  it("throws when ARBITRUM_SEPOLIA_RPC is missing", () => {
    // #given
    delete process.env.ARBITRUM_SEPOLIA_RPC;
    // #when / #then
    expect(() => validateEnv()).toThrow(/ARBITRUM_SEPOLIA_RPC/);
  });

  it("throws when AGENT_PUBLIC_JWK is missing", () => {
    // #given
    delete process.env.AGENT_PUBLIC_JWK;
    // #when / #then
    expect(() => validateEnv()).toThrow(/AGENT_PUBLIC_JWK/);
  });

  it("throws when ADMIN_TOKEN is missing in prod", () => {
    // #given prod env without ADMIN_TOKEN
    process.env.APP_ENV = "prod";
    delete process.env.ADMIN_TOKEN;
    // #when / #then
    expect(() => validateEnv()).toThrow(/ADMIN_TOKEN/);
  });

  it("passes in prod when ADMIN_TOKEN is present", () => {
    // #given
    process.env.APP_ENV = "prod";
    process.env.ADMIN_TOKEN = "secure-token-xyz";
    // #when / #then
    expect(() => validateEnv()).not.toThrow();
  });

  it("error message includes APP_ENV value", () => {
    // #given staging env with missing var
    process.env.APP_ENV = "staging";
    delete process.env.PRIVATE_KEY;
    // #when / #then
    expect(() => validateEnv()).toThrow(/APP_ENV="staging"/);
  });
});
