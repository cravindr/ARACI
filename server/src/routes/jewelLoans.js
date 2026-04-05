import { Router } from "express";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db/pool.js";
import { authRequired } from "../middleware/auth.js";
import {
  getJewelLoanDefaultTouchPct,
  getJewelLoanDefaultInterestRate,
} from "../appSettings.js";

export const jewelLoansRouter = Router();

const BOARD_ID = 1;

const __agentDir = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DEBUG_LOG = path.join(__agentDir, "..", "..", "..", "debug-94386b.log");

function agentDebugLog(entry) {
  try {
    fs.appendFileSync(
      AGENT_DEBUG_LOG,
      JSON.stringify({ sessionId: "94386b", timestamp: Date.now(), ...entry }) + "\n"
    );
  } catch {
    /* ignore */
  }
}

/** @returns {{ skip: true } | { skip: false, value: Date | null } | { error: string }} */
function loanAsOfFromBody(body) {
  const b = body || {};
  const has =
    Object.prototype.hasOwnProperty.call(b, "loanAsOf") ||
    Object.prototype.hasOwnProperty.call(b, "loan_as_of");
  if (!has) return { skip: true };
  const raw = b.loanAsOf ?? b.loan_as_of;
  if (raw == null || raw === "") return { skip: false, value: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { error: "Invalid loanAsOf datetime" };
  return { skip: false, value: d };
}

function num(v) {
  if (v == null) return null;
  return Number(typeof v === "bigint" ? v : v);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function toIsoOrNull(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Board rate = INR per gram of fine (24K) gold; touch_pct is purity on total weight. */
export function computeJewelWorthInr(totalWeightGrams, touchPct, boardRatePerGram) {
  const w = round3(totalWeightGrams);
  const t = round3(touchPct);
  const r = Number(boardRatePerGram);
  if (!Number.isFinite(w) || !Number.isFinite(t) || !Number.isFinite(r) || w <= 0 || t <= 0 || r < 0) {
    return null;
  }
  const fineGrams = w * (t / 100);
  return round2(fineGrams * r);
}

async function getBoardRate(conn) {
  const rows = await conn.query(
    `SELECT rate FROM gold_board_rate WHERE id = ?`,
    [BOARD_ID]
  );
  if (!rows[0]) return null;
  return round2(rows[0].rate);
}

jewelLoansRouter.get("/", authRequired, async (req, res, next) => {
  try {
    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    if (!customerId || !Number.isFinite(customerId)) {
      return res.status(400).json({ error: "customerId is required" });
    }
    const loans = await pool.query(
      `SELECT jl.id, jl.customer_id, jl.total_weight, jl.touch_pct, jl.interest_rate,
              jl.loan_amount, jl.board_rate_inr_per_gram, jl.jewel_worth_inr, jl.loan_as_of,
              jl.created_at,
              c.name AS customer_name
       FROM jewel_loans jl
       JOIN customers c ON c.id = jl.customer_id
       WHERE jl.customer_id = ?
       ORDER BY jl.id DESC`,
      [customerId]
    );
    const loanIds = loans.map((r) => num(r.id));
    if (!loanIds.length) return res.json([]);

    const placeholders = loanIds.map(() => "?").join(",");
    const itemRows = await pool.query(
      `SELECT jli.loan_id, jli.jewel_type_id, jli.quantity, jli.weight_grams,
              jt.name AS jewel_type_name, jt.description AS jewel_type_description
       FROM jewel_loan_items jli
       JOIN jewel_types jt ON jt.id = jli.jewel_type_id
       WHERE jli.loan_id IN (${placeholders})
       ORDER BY jli.id ASC`,
      loanIds
    );
    const byLoan = new Map();
    for (const r of itemRows) {
      const lid = num(r.loan_id);
      if (!byLoan.has(lid)) byLoan.set(lid, []);
      byLoan.get(lid).push(mapLoanItemRow(r));
    }
    res.json(
      loans.map((r) => ({
        id: num(r.id),
        customerId: num(r.customer_id),
        customerName: r.customer_name,
        totalWeight: round3(r.total_weight),
        touchPct: round3(r.touch_pct),
        interestRate: round3(r.interest_rate),
        loanAmount: round2(r.loan_amount),
        boardRateInrPerGram: r.board_rate_inr_per_gram != null ? round2(r.board_rate_inr_per_gram) : null,
        jewelWorthInr: r.jewel_worth_inr != null ? round2(r.jewel_worth_inr) : null,
        loanAsOf: toIsoOrNull(r.loan_as_of),
        createdAt: toIsoOrNull(r.created_at),
        items: byLoan.get(num(r.id)) || [],
      }))
    );
  } catch (e) {
    next(e);
  }
});

jewelLoansRouter.post("/", authRequired, async (req, res, next) => {
  let conn;
  try {
    const body = req.body || {};
    const customerId = Number(body.customerId);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "customerId is required" });
    }
    const totalWeight = round3(body.totalWeight);
    const touchPct =
      body.touchPct != null && String(body.touchPct).trim() !== ""
        ? round3(body.touchPct)
        : await getJewelLoanDefaultTouchPct();
    const interestRate =
      body.interestRate != null && String(body.interestRate).trim() !== ""
        ? round3(body.interestRate)
        : await getJewelLoanDefaultInterestRate();
    const loanAmount = round2(body.loanAmount);

    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      return res.status(400).json({ error: "totalWeight must be a positive number" });
    }
    if (!Number.isFinite(touchPct) || touchPct <= 0 || touchPct > 100) {
      return res.status(400).json({ error: "touch (purity %) must be between 0 and 100" });
    }
    if (!Number.isFinite(interestRate) || interestRate < 0) {
      return res.status(400).json({ error: "interestRate must be a non-negative number" });
    }
    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      return res.status(400).json({ error: "loanAmount must be a positive number" });
    }

    const parsedPostItems = parseLoanItems(body);
    if (parsedPostItems.error) {
      return res.status(400).json({ error: parsedPostItems.error });
    }
    const { merged } = parsedPostItems;

    const cust = await pool.query(`SELECT id FROM customers WHERE id = ?`, [customerId]);
    if (!cust.length) {
      return res.status(400).json({ error: "Customer not found" });
    }

    const typeIds = [...merged.keys()];
    const ph = typeIds.map(() => "?").join(",");
    const types = await pool.query(
      `SELECT id FROM jewel_types WHERE id IN (${ph})`,
      typeIds
    );
    if (types.length !== typeIds.length) {
      return res.status(400).json({ error: "Invalid jewel type in items" });
    }

    const loanAsOfPatch = loanAsOfFromBody(body);
    if (loanAsOfPatch.error) {
      return res.status(400).json({ error: loanAsOfPatch.error });
    }
    const loanAsOfInsert = loanAsOfPatch.skip ? null : loanAsOfPatch.value;

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const boardRate = await getBoardRate(conn);
    const jewelWorth = computeJewelWorthInr(totalWeight, touchPct, boardRate);

    const ins = await conn.query(
      `INSERT INTO jewel_loans (
        customer_id, total_weight, touch_pct, interest_rate, loan_amount,
        board_rate_inr_per_gram, jewel_worth_inr, loan_as_of
      ) VALUES (?,?,?,?,?,?,?,?)`,
      [
        customerId,
        totalWeight,
        touchPct,
        interestRate,
        loanAmount,
        boardRate,
        jewelWorth,
        loanAsOfInsert,
      ]
    );
    const loanId = num(ins.insertId);

    for (const [jewelTypeId, row] of merged) {
      await conn.query(
        `INSERT INTO jewel_loan_items (loan_id, jewel_type_id, quantity, weight_grams) VALUES (?,?,?,?)`,
        [loanId, jewelTypeId, row.quantity, row.weightGrams]
      );
    }

    await conn.commit();

    const rows = await pool.query(
      `SELECT jl.*, c.name AS customer_name FROM jewel_loans jl
       JOIN customers c ON c.id = jl.customer_id WHERE jl.id = ?`,
      [loanId]
    );
    const r = rows[0];
    // #region agent log
    agentDebugLog({
      location: "jewelLoans.js:POST",
      message: "loan created",
      hypothesisId: "H2",
      data: { loanId, loanAsOf: toIsoOrNull(r.loan_as_of) },
    });
    // #endregion
    const itemsOut = await pool.query(
      `SELECT jli.jewel_type_id, jli.quantity, jli.weight_grams, jt.name AS jewel_type_name, jt.description AS jewel_type_description
       FROM jewel_loan_items jli JOIN jewel_types jt ON jt.id = jli.jewel_type_id
       WHERE jli.loan_id = ? ORDER BY jli.id`,
      [loanId]
    );
    res.status(201).json({
      id: loanId,
      customerId: num(r.customer_id),
      customerName: r.customer_name,
      totalWeight: round3(r.total_weight),
      touchPct: round3(r.touch_pct),
      interestRate: round3(r.interest_rate),
      loanAmount: round2(r.loan_amount),
      boardRateInrPerGram: r.board_rate_inr_per_gram != null ? round2(r.board_rate_inr_per_gram) : null,
      jewelWorthInr: r.jewel_worth_inr != null ? round2(r.jewel_worth_inr) : null,
      loanAsOf: toIsoOrNull(r.loan_as_of),
      createdAt: toIsoOrNull(r.created_at),
      items: itemsOut.map((x) => mapLoanItemRow(x)),
    });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    next(e);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

/** Verify current user's login password (e.g. before destructive actions). */
async function verifyCurrentUserPassword(userId, password) {
  if (password == null || typeof password !== "string" || password === "") {
    return { ok: false, status: 400, error: "Password is required" };
  }
  const rows = await pool.query(
    `SELECT password_hash FROM users WHERE id = ?`,
    [userId]
  );
  if (!rows[0]) {
    return { ok: false, status: 404, error: "User not found" };
  }
  const match = await bcrypt.compare(password, rows[0].password_hash);
  if (!match) {
    return { ok: false, status: 403, error: "Incorrect password" };
  }
  return { ok: true };
}

function parseLoanItems(body) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  /** @type {Map<number, { quantity: number, weightGrams: number | null }>} */
  const merged = new Map();
  for (const it of rawItems) {
    const tid = Number(it?.jewelTypeId);
    const qty = Math.floor(Number(it?.quantity));
    if (!Number.isFinite(tid) || tid <= 0) {
      return { error: "Each item needs a valid jewelTypeId" };
    }
    if (!Number.isFinite(qty) || qty < 1) {
      return { error: "Each item needs quantity >= 1" };
    }
    const wRaw = it?.weightGrams ?? it?.weight_grams;
    let w = null;
    if (wRaw != null && String(wRaw).trim() !== "") {
      const wg = round3(wRaw);
      if (!Number.isFinite(wg) || wg < 0) {
        return { error: "Each item needs a valid weightGrams (grams)" };
      }
      w = wg > 0 ? wg : null;
    }
    const prev = merged.get(tid);
    if (!prev) {
      merged.set(tid, { quantity: qty, weightGrams: w });
    } else {
      prev.quantity += qty;
      if (w != null) {
        const base = prev.weightGrams != null ? prev.weightGrams : 0;
        prev.weightGrams = round3(base + w);
      }
      merged.set(tid, prev);
    }
  }
  if (merged.size === 0) {
    return { error: "At least one jewel type with quantity is required" };
  }
  return { merged };
}

function mapLoanItemRow(x) {
  return {
    jewelTypeId: num(x.jewel_type_id),
    jewelTypeName: x.jewel_type_name,
    jewelTypeDescription: x.jewel_type_description ?? null,
    quantity: num(x.quantity),
    weightGrams: x.weight_grams != null ? round3(x.weight_grams) : null,
  };
}

jewelLoansRouter.put("/:id(\\d+)", authRequired, async (req, res, next) => {
  let conn;
  try {
    const id = Number(req.params.id);
    const existingRows = await pool.query(
      `SELECT id, customer_id FROM jewel_loans WHERE id = ?`,
      [id]
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: "Loan not found" });
    }
    const customerId = num(existingRows[0].customer_id);

    const body = req.body || {};
    const totalWeight = round3(body.totalWeight);
    const touchPct =
      body.touchPct != null && String(body.touchPct).trim() !== ""
        ? round3(body.touchPct)
        : await getJewelLoanDefaultTouchPct();
    const interestRate =
      body.interestRate != null && String(body.interestRate).trim() !== ""
        ? round3(body.interestRate)
        : await getJewelLoanDefaultInterestRate();
    const loanAmount = round2(body.loanAmount);

    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      return res.status(400).json({ error: "totalWeight must be a positive number" });
    }
    if (!Number.isFinite(touchPct) || touchPct <= 0 || touchPct > 100) {
      return res.status(400).json({ error: "touch (purity %) must be between 0 and 100" });
    }
    if (!Number.isFinite(interestRate) || interestRate < 0) {
      return res.status(400).json({ error: "interestRate must be a non-negative number" });
    }
    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      return res.status(400).json({ error: "loanAmount must be a positive number" });
    }

    const parsedItems = parseLoanItems(body);
    if (parsedItems.error) {
      return res.status(400).json({ error: parsedItems.error });
    }
    const { merged } = parsedItems;

    const typeIds = [...merged.keys()];
    const ph = typeIds.map(() => "?").join(",");
    const types = await pool.query(
      `SELECT id FROM jewel_types WHERE id IN (${ph})`,
      typeIds
    );
    if (types.length !== typeIds.length) {
      return res.status(400).json({ error: "Invalid jewel type in items" });
    }

    const loanAsOfPatch = loanAsOfFromBody(body);
    if (loanAsOfPatch.error) {
      return res.status(400).json({ error: loanAsOfPatch.error });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const boardRate = await getBoardRate(conn);
    const jewelWorth = computeJewelWorthInr(totalWeight, touchPct, boardRate);

    const setParts = [
      "total_weight = ?",
      "touch_pct = ?",
      "interest_rate = ?",
      "loan_amount = ?",
      "board_rate_inr_per_gram = ?",
      "jewel_worth_inr = ?",
    ];
    const updateParams = [
      totalWeight,
      touchPct,
      interestRate,
      loanAmount,
      boardRate,
      jewelWorth,
    ];
    if (!loanAsOfPatch.skip) {
      setParts.push("loan_as_of = ?");
      updateParams.push(loanAsOfPatch.value);
    }
    updateParams.push(id, customerId);
    await conn.query(
      `UPDATE jewel_loans SET ${setParts.join(", ")} WHERE id = ? AND customer_id = ?`,
      updateParams
    );

    await conn.query(`DELETE FROM jewel_loan_items WHERE loan_id = ?`, [id]);
    for (const [jewelTypeId, row] of merged) {
      await conn.query(
        `INSERT INTO jewel_loan_items (loan_id, jewel_type_id, quantity, weight_grams) VALUES (?,?,?,?)`,
        [id, jewelTypeId, row.quantity, row.weightGrams]
      );
    }

    await conn.commit();

    const rows = await pool.query(
      `SELECT jl.*, c.name AS customer_name FROM jewel_loans jl
       JOIN customers c ON c.id = jl.customer_id WHERE jl.id = ?`,
      [id]
    );
    const r = rows[0];
    // #region agent log
    agentDebugLog({
      location: "jewelLoans.js:PUT",
      message: "loan updated",
      hypothesisId: "H2",
      data: { loanId: id, loanAsOf: toIsoOrNull(r.loan_as_of), patchedLoanAsOf: !loanAsOfPatch.skip },
    });
    // #endregion
    const itemsOut = await pool.query(
      `SELECT jli.jewel_type_id, jli.quantity, jli.weight_grams, jt.name AS jewel_type_name, jt.description AS jewel_type_description
       FROM jewel_loan_items jli JOIN jewel_types jt ON jt.id = jli.jewel_type_id
       WHERE jli.loan_id = ? ORDER BY jli.id`,
      [id]
    );
    res.json({
      id: num(r.id),
      customerId: num(r.customer_id),
      customerName: r.customer_name,
      totalWeight: round3(r.total_weight),
      touchPct: round3(r.touch_pct),
      interestRate: round3(r.interest_rate),
      loanAmount: round2(r.loan_amount),
      boardRateInrPerGram: r.board_rate_inr_per_gram != null ? round2(r.board_rate_inr_per_gram) : null,
      jewelWorthInr: r.jewel_worth_inr != null ? round2(r.jewel_worth_inr) : null,
      loanAsOf: toIsoOrNull(r.loan_as_of),
      createdAt: toIsoOrNull(r.created_at),
      items: itemsOut.map((x) => mapLoanItemRow(x)),
    });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    next(e);
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

jewelLoansRouter.delete("/:id(\\d+)", authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const password = req.body?.password;
    const check = await verifyCurrentUserPassword(req.user.sub, password);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    const result = await pool.query(`DELETE FROM jewel_loans WHERE id = ?`, [id]);
    const ar = result.affectedRows;
    const affected = ar == null ? 0 : Number(typeof ar === "bigint" ? ar : ar);
    if (!affected) {
      return res.status(404).json({ error: "Loan not found" });
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
