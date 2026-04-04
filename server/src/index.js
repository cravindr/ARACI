import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { config } from "./config.js";import { ensureDatabaseExists } from "./db/ensureDatabase.js";
import { pool } from "./db/pool.js";
import { initSchema } from "./db/initSchema.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { jewelTypesRouter } from "./routes/jewelTypes.js";
import { placesRouter } from "./routes/places.js";
import { boardRateRouter } from "./routes/boardRate.js";
import { customersRouter } from "./routes/customers.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(503).json({ ok: false, db: "error", message: e.message });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/jewel-types", jewelTypesRouter);
app.use("/api/places", placesRouter);
app.use("/api/board-rate", boardRateRouter);
app.use("/api/customers", customersRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  const message = err.sqlMessage || err.message || "Internal server error";
  res.status(500).json({ error: message });
});

async function main() {
  await ensureDatabaseExists();
  await initSchema();
  await fs.mkdir(config.uploadRoot, { recursive: true });
  await fs.mkdir(path.join(config.uploadRoot, "tmp"), { recursive: true });
  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
