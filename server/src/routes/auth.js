import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { authRequired } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const rows = await pool.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.is_active, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.username = ? OR u.email = ?`,
    [username, username]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign(
    {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role_name,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role_name,
    },
  });
});

authRouter.get("/me", authRequired, async (req, res) => {
  const rows = await pool.query(
    `SELECT u.id, u.username, u.email, u.is_active, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [req.user.sub]
  );
  const user = rows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role_name,
    isActive: !!user.is_active,
  });
});
