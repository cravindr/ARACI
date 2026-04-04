import { Router } from "express";
import { pool } from "../db/pool.js";
import { authRequired, requireAdministrator } from "../middleware/auth.js";

export const boardRateRouter = Router();

const SINGLETON_ID = 1;
const DEFAULT_HISTORY_COMMENT = "gold rate changed";

function roundRate2(n) {
  return Math.round(n * 100) / 100;
}

function toNumberRate(v) {
  const n = Number(typeof v === "bigint" ? v : v);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return roundRate2(n);
}

/** JSON.stringify throws on BigInt; MariaDB may return BIGINT / DECIMAL edge cases as bigint. */
function jsonNum(v) {
  if (v == null) return null;
  return Number(typeof v === "bigint" ? v : v);
}

function jsonRate(v) {
  if (v == null) return null;
  return roundRate2(Number(typeof v === "bigint" ? v : v));
}

function jsonDate(v) {
  if (v == null) return null;
  if (typeof v === "bigint") return new Date(Number(v)).toISOString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

boardRateRouter.get("/history", authRequired, async (req, res, next) => {
  try {
    const rows = await pool.query(
      `SELECT id, rate, changed_at, comment
       FROM gold_board_rate_history
       ORDER BY changed_at DESC, id DESC
       LIMIT 500`
    );
    res.json(
      rows.map((r) => ({
        id: jsonNum(r.id),
        rate: jsonRate(r.rate),
        changedAt: jsonDate(r.changed_at),
        comment: r.comment,
      }))
    );
  } catch (e) {
    next(e);
  }
});

boardRateRouter.get("/", authRequired, async (req, res, next) => {
  try {
    const rows = await pool.query(
      `SELECT rate, updated_at FROM gold_board_rate WHERE id = ?`,
      [SINGLETON_ID]
    );
    const row = rows[0];
    if (!row) {
      return res.json({ rate: null, updatedAt: null });
    }
    res.json({
      rate: jsonRate(row.rate),
      updatedAt: jsonDate(row.updated_at),
    });
  } catch (e) {
    next(e);
  }
});

boardRateRouter.put("/", authRequired, requireAdministrator, async (req, res, next) => {
  const rate = toNumberRate(req.body?.rate);
  if (rate === null) {
    return res.status(400).json({ error: "rate must be a non-negative number" });
  }

  let comment = req.body?.comment;
  if (comment == null || String(comment).trim() === "") {
    comment = DEFAULT_HISTORY_COMMENT;
  } else {
    comment = String(comment).trim().slice(0, 500);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const curRows = await conn.query(
      `SELECT rate, updated_at FROM gold_board_rate WHERE id = ? FOR UPDATE`,
      [SINGLETON_ID]
    );
    const prev = curRows[0] ? Number(curRows[0].rate) : null;

    if (prev !== null && prev === rate) {
      await conn.rollback();
      return res.json({
        rate,
        updatedAt: jsonDate(curRows[0].updated_at),
        unchanged: true,
      });
    }

    await conn.query(
      `INSERT INTO gold_board_rate_history (rate, changed_at, comment) VALUES (?, NOW(), ?)`,
      [rate, comment]
    );

    await conn.query(
      `INSERT INTO gold_board_rate (id, rate) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE rate = ?, updated_at = CURRENT_TIMESTAMP`,
      [SINGLETON_ID, rate, rate]
    );

    const out = await conn.query(
      `SELECT rate, updated_at FROM gold_board_rate WHERE id = ?`,
      [SINGLETON_ID]
    );
    await conn.commit();

    const r = out[0];
    if (!r) {
      return next(new Error("gold_board_rate row missing after upsert"));
    }
    return res.json({
      rate: jsonRate(r.rate),
      updatedAt: jsonDate(r.updated_at),
      unchanged: false,
    });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    return next(e);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});
