import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import { adminRouter } from "../routes/admin.js";
import { isPaused, resume } from "../services/pause.js";

const app = express();
app.use(express.json());
app.use("/api", adminRouter);
const request = supertest(app);

const VALID_TOKEN = "test-admin-token-abc123";

beforeEach(() => {
  process.env.ADMIN_TOKEN = VALID_TOKEN;
  resume();
  delete process.env.EXECUTION_PAUSED;
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
  delete process.env.EXECUTION_PAUSED;
  resume();
});

describe("GET /api/admin/status", () => {
  it("returns 401 when no Authorization header", async () => {
    // #given no auth header
    // #when
    const res = await request.get("/api/admin/status");
    // #then
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is wrong", async () => {
    // #given wrong token
    // #when
    const res = await request.get("/api/admin/status").set("Authorization", "Bearer wrong-token");
    // #then
    expect(res.status).toBe(401);
  });

  it("returns 503 when ADMIN_TOKEN is not configured", async () => {
    // #given token not set
    delete process.env.ADMIN_TOKEN;
    // #when
    const res = await request.get("/api/admin/status").set("Authorization", `Bearer ${VALID_TOKEN}`);
    // #then
    expect(res.status).toBe(503);
  });

  it("returns paused=false when execution is running", async () => {
    // #given running state
    // #when
    const res = await request.get("/api/admin/status").set("Authorization", `Bearer ${VALID_TOKEN}`);
    // #then
    expect(res.status).toBe(200);
    expect(res.body.paused).toBe(false);
  });
});

describe("POST /api/admin/pause", () => {
  it("returns 401 without valid token", async () => {
    // #given
    // #when
    const res = await request.post("/api/admin/pause");
    // #then
    expect(res.status).toBe(401);
  });

  it("pauses execution and returns paused=true", async () => {
    // #given execution is running
    expect(isPaused()).toBe(false);
    // #when
    const res = await request.post("/api/admin/pause").set("Authorization", `Bearer ${VALID_TOKEN}`);
    // #then
    expect(res.status).toBe(200);
    expect(res.body.paused).toBe(true);
    expect(isPaused()).toBe(true);
  });

  it("sets pausedAt timestamp on pause", async () => {
    // #given
    const before = new Date().toISOString();
    // #when
    const res = await request.post("/api/admin/pause").set("Authorization", `Bearer ${VALID_TOKEN}`);
    // #then
    expect(res.body.pausedAt >= before).toBe(true);
  });
});

describe("POST /api/admin/resume", () => {
  it("resumes execution after pause", async () => {
    // #given paused
    await request.post("/api/admin/pause").set("Authorization", `Bearer ${VALID_TOKEN}`);
    expect(isPaused()).toBe(true);
    // #when
    const res = await request.post("/api/admin/resume").set("Authorization", `Bearer ${VALID_TOKEN}`);
    // #then
    expect(res.status).toBe(200);
    expect(res.body.paused).toBe(false);
    expect(isPaused()).toBe(false);
  });
});
