import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { authRequired, requireAdministrator } from "../middleware/auth.js";

export const usersRouter = Router();

usersRouter.use(authRequired, requireAdministrator);

usersRouter.get("/roles/list", async (_req, res) => {
  const rows = await pool.query(
    "SELECT id, name FROM roles ORDER BY id ASC"
  );
  res.json(rows);
});

usersRouter.get("/", async (_req, res) => {
  const rows = await pool.query(
    `SELECT u.id, u.username, u.email, u.is_active, r.name AS role_name, u.created_at
     FROM users u
     JOIN roles r ON r.id = u.role_id
     ORDER BY u.id ASC`
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role_name,
      isActive: !!r.is_active,
      createdAt: r.created_at,
    }))
  );
});

usersRouter.post("/", async (req, res) => {
  const { username, email, password, roleId } = req.body || {};
  if (!username || !email || !password || !roleId) {
    return res
      .status(400)
      .json({ error: "username, email, password, and roleId are required" });
  }
  const roleRows = await pool.query("SELECT id, name FROM roles WHERE id = ?", [
    roleId,
  ]);
  if (!roleRows.length) {
    return res.status(400).json({ error: "Invalid roleId" });
  }
  const hash = await bcrypt.hash(String(password), 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role_id)
       VALUES (?, ?, ?, ?)`,
      [username.trim(), email.trim().toLowerCase(), hash, roleId]
    );
    res.status(201).json({
      id: result.insertId,
      username: username.trim(),
      email: email.trim().toLowerCase(),
      role: roleRows[0].name,
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    throw e;
  }
});

usersRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const { username, email, password, roleId, isActive } = req.body || {};
  const existing = await pool.query("SELECT id FROM users WHERE id = ?", [id]);
  if (!existing.length) {
    return res.status(404).json({ error: "User not found" });
  }
  if (roleId) {
    const roleRows = await pool.query("SELECT id FROM roles WHERE id = ?", [
      roleId,
    ]);
    if (!roleRows.length) {
      return res.status(400).json({ error: "Invalid roleId" });
    }
  }
  const updates = [];
  const params = [];
  if (username != null) {
    updates.push("username = ?");
    params.push(String(username).trim());
  }
  if (email != null) {
    updates.push("email = ?");
    params.push(String(email).trim().toLowerCase());
  }
  if (password) {
    updates.push("password_hash = ?");
    params.push(await bcrypt.hash(String(password), 10));
  }
  if (roleId != null) {
    updates.push("role_id = ?");
    params.push(roleId);
  }
  if (isActive != null) {
    updates.push("is_active = ?");
    params.push(isActive ? 1 : 0);
  }
  if (!updates.length) {
    return res.status(400).json({ error: "No fields to update" });
  }
  params.push(id);
  try {
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    throw e;
  }
  const rows = await pool.query(
    `SELECT u.id, u.username, u.email, u.is_active, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [id]
  );
  const u = rows[0];
  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role_name,
    isActive: !!u.is_active,
  });
});

usersRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  if (id === req.user.sub) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  const result = await pool.query("DELETE FROM users WHERE id = ?", [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.status(204).send();
});
