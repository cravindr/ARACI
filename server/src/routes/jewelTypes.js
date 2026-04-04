import { Router } from "express";
import { pool } from "../db/pool.js";
import { authRequired, requireAdministrator } from "../middleware/auth.js";

export const jewelTypesRouter = Router();

jewelTypesRouter.get("/", authRequired, async (_req, res) => {
  const rows = await pool.query(
    `SELECT id, name, description, created_at, updated_at
     FROM jewel_types ORDER BY name ASC`
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  );
});

jewelTypesRouter.post("/", authRequired, requireAdministrator, async (req, res) => {
  const { name, description } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO jewel_types (name, description) VALUES (?, ?)`,
      [String(name).trim(), description ? String(description).trim() : null]
    );
    res.status(201).json({
      id: result.insertId,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Jewel type name already exists" });
    }
    throw e;
  }
});

jewelTypesRouter.put("/:id", authRequired, requireAdministrator, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const { name, description } = req.body || {};
  if (name == null && description === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  const updates = [];
  const params = [];
  if (name != null) {
    updates.push("name = ?");
    params.push(String(name).trim());
  }
  if (description !== undefined) {
    updates.push("description = ?");
    params.push(description == null || description === "" ? null : String(description).trim());
  }
  params.push(id);
  try {
    const result = await pool.query(
      `UPDATE jewel_types SET ${updates.join(", ")} WHERE id = ?`,
      params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Not found" });
    }
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Jewel type name already exists" });
    }
    throw e;
  }
  const rows = await pool.query(
    `SELECT id, name, description FROM jewel_types WHERE id = ?`,
    [id]
  );
  const r = rows[0];
  res.json({
    id: r.id,
    name: r.name,
    description: r.description,
  });
});

jewelTypesRouter.delete("/:id", authRequired, requireAdministrator, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const result = await pool.query("DELETE FROM jewel_types WHERE id = ?", [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Not found" });
  }
  res.status(204).send();
});
