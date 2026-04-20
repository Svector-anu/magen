import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { isPaused, pause, resume, pauseStatus } from "../services/pause.js";

beforeEach(() => {
  resume();
  delete process.env.EXECUTION_PAUSED;
});

afterEach(() => {
  delete process.env.EXECUTION_PAUSED;
});

describe("pause service", () => {
  describe("isPaused", () => {
    it("returns false by default", () => {
      // #given fresh state
      // #when / #then
      expect(isPaused()).toBe(false);
    });

    it("returns true after pause()", () => {
      // #given
      pause();
      // #when / #then
      expect(isPaused()).toBe(true);
    });

    it("returns false after resume()", () => {
      // #given
      pause();
      resume();
      // #when / #then
      expect(isPaused()).toBe(false);
    });

    it("returns true when EXECUTION_PAUSED env var is set to true", () => {
      // #given
      process.env.EXECUTION_PAUSED = "true";
      // #when / #then
      expect(isPaused()).toBe(true);
    });

    it("returns false when EXECUTION_PAUSED env var is not true", () => {
      // #given
      process.env.EXECUTION_PAUSED = "false";
      // #when / #then
      expect(isPaused()).toBe(false);
    });
  });

  describe("pauseStatus", () => {
    it("reflects paused=false and no timestamps in default state", () => {
      // #given fresh state after resume()
      // #when
      const status = pauseStatus();
      // #then
      expect(status.paused).toBe(false);
      expect(status.resumedAt).not.toBeNull();
    });

    it("sets pausedAt when paused", () => {
      // #given
      const before = new Date().toISOString();
      pause();
      // #when
      const status = pauseStatus();
      // #then
      expect(status.paused).toBe(true);
      expect(status.pausedAt).not.toBeNull();
      expect(status.pausedAt! >= before).toBe(true);
      expect(status.resumedAt).toBeNull();
    });

    it("sets resumedAt when resumed", () => {
      // #given
      pause();
      resume();
      // #when
      const status = pauseStatus();
      // #then
      expect(status.paused).toBe(false);
      expect(status.resumedAt).not.toBeNull();
    });
  });
});
