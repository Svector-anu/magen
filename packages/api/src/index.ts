import dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(import.meta.dirname, "../../../.env") });
import express from "express";
import cors from "cors";
import { parseRouter } from "./routes/parse.js";
import { contactsRouter } from "./routes/contacts.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", parseRouter);
app.use("/api", contactsRouter);

app.listen(port, () => {
  console.log(`Magen API listening on port ${port}`);
});
