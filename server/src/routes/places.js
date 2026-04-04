import { Router } from "express";
import { pool } from "../db/pool.js";
import { authRequired, requireAdministrator } from "../middleware/auth.js";

export const placesRouter = Router();

function normalizeInitial(v) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  if (s.length !== 2) {
    return null;
  }
  return s;
}

placesRouter.get("/", authRequired, async (_req, res) => {
  const rows = await pool.query(
    `SELECT id, name, initial, description, created_at, updated_at
     FROM places ORDER BY name ASC`
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      initial: r.initial,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  );
});

placesRouter.post("/", authRequired, requireAdministrator, async (req, res) => {
  const { name, description, initial } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const ini = normalizeInitial(initial);
  if (!ini) {
    return res
      .status(400)
      .json({ error: "initial is required and must be exactly 2 characters" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO places (name, initial, description) VALUES (?, ?, ?)`,
      [String(name).trim(), ini, description ? String(description).trim() : null]
    );
    res.status(201).json({
      id: result.insertId,
      name: String(name).trim(),
      initial: ini,
      description: description ? String(description).trim() : null,
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Place name or initial already exists" });
    }
    throw e;
  }
});

placesRouter.put("/:id", authRequired, requireAdministrator, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const { name, description, initial } = req.body || {};
  if (name == null && description === undefined && initial === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  const updates = [];
  const params = [];
  if (name != null) {
    updates.push("name = ?");
    params.push(String(name).trim());
  }
  if (initial !== undefined) {
    const ini = normalizeInitial(initial);
    if (!ini) {
      return res
        .status(400)
        .json({ error: "initial must be exactly 2 characters" });
    }
    updates.push("initial = ?");
    params.push(ini);
  }
  if (description !== undefined) {
    updates.push("description = ?");
    params.push(description == null || description === "" ? null : String(description).trim());
  }
  params.push(id);
  try {
    const result = await pool.query(
      `UPDATE places SET ${updates.join(", ")} WHERE id = ?`,
      params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Not found" });
    }
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Place name or initial already exists" });
    }
    throw e;
  }
  const rows = await pool.query(
    `SELECT id, name, initial, description FROM places WHERE id = ?`,
    [id]
  );
  const r = rows[0];
  res.json({
    id: r.id,
    name: r.name,
    initial: r.initial,
    description: r.description,
  });
});

placesRouter.delete("/:id", authRequired, requireAdministrator, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const result = await pool.query("DELETE FROM places WHERE id = ?", [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Not found" });
  }
  res.status(204).send();
});
