import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { notify, _resetRecentFailuresForTest } from "../services/notify.js";

const WEBHOOK = "https://discord.example.com/webhook";

beforeEach(() => {
  _resetRecentFailuresForTest();
  process.env.WEBHOOK_URL = WEBHOOK;
  process.env.WEBHOOK_ENABLED = "true";
  jest.spyOn(global, "fetch").mockResolvedValue(new Response());
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.WEBHOOK_URL;
  delete process.env.WEBHOOK_ENABLED;
  _resetRecentFailuresForTest();
});

describe("notify", () => {
  it("posts to webhook on execution.success", async () => {
    // #given
    // #when
    notify({ type: "execution.success", jobId: "job-1", policyId: "pol-1", txHash: "0xabc" });
    await Promise.resolve(); // allow microtask to flush
    // #then
    expect(fetch).toHaveBeenCalledWith(WEBHOOK, expect.objectContaining({ method: "POST" }));
  });

  it("does not post to webhook when WEBHOOK_URL is not set", async () => {
    // #given
    delete process.env.WEBHOOK_URL;
    // #when
    notify({ type: "execution.failure", jobId: "job-1" });
    await Promise.resolve();
    // #then
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not post to webhook when WEBHOOK_ENABLED=false", async () => {
    // #given
    process.env.WEBHOOK_ENABLED = "false";
    // #when
    notify({ type: "execution.success", jobId: "job-1" });
    await Promise.resolve();
    // #then
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("volume alert", () => {
  it("does not fire before reaching VOLUME_THRESHOLD failures", async () => {
    // #given 4 failures (threshold is 5)
    for (let i = 0; i < 4; i++) {
      notify({ type: "execution.failure", jobId: `job-${i}` });
    }
    await Promise.resolve();
    // #then — webhook called 4 times for failures, but no volume_alert payload
    const bodies = (fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string)
    );
    expect(bodies.some((b) => b.text?.includes("volume_alert"))).toBe(false);
  });

  it("fires volume_alert webhook after VOLUME_THRESHOLD failures", async () => {
    // #given 5 failures in sequence
    for (let i = 0; i < 5; i++) {
      notify({ type: "execution.failure", jobId: `job-${i}` });
    }
    await Promise.resolve();
    // #then — one webhook call should carry volume_alert
    const bodies = (fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string)
    );
    expect(bodies.some((b) => (b.text as string)?.includes("volume_alert"))).toBe(true);
  });

  it("resets the failure buffer after alert fires", async () => {
    // #given threshold reached (buffer resets)
    for (let i = 0; i < 5; i++) {
      notify({ type: "execution.failure", jobId: `job-${i}` });
    }
    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
    // #when 4 more failures after reset
    for (let i = 0; i < 4; i++) {
      notify({ type: "execution.failure", jobId: `job-new-${i}` });
    }
    await Promise.resolve();
    // #then — no second volume_alert yet
    const bodies = (fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string)
    );
    expect(bodies.some((b) => (b.text as string)?.includes("volume_alert"))).toBe(false);
  });
});
