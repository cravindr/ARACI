import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { authRequired } from "../middleware/auth.js";
import { uploadCustomerFiles } from "../middleware/customerUpload.js";
import { getCustomerListPageSize } from "../appSettings.js";

export const customersRouter = Router();

const SEARCH_FIELDS = [
  "c.name",
  "c.father_name",
  "c.address",
  "c.pan_number",
  "c.aadhar_number",
  "c.pin_code",
  "c.mobile1",
  "c.mobile2",
  "c.comments",
  "c.references_comment",
  "p.name",
  "p.initial",
  "ref.name",
];

function num(v) {
  if (v == null) return null;
  return Number(typeof v === "bigint" ? v : v);
}

async function cleanupMulterFiles(req) {
  const files = req.files;
  if (!files) return;
  for (const arr of Object.values(files)) {
    for (const f of arr || []) {
      try {
        await fs.unlink(f.path);
      } catch {
        /* ignore */
      }
    }
  }
}

function escapeLike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildSearchOnFields(q, fields) {
  const raw = String(q || "").trim();
  if (!raw) return { sql: "", params: [] };
  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return { sql: "", params: [] };
  const parts = [];
  const params = [];
  for (const word of words) {
    const like = `%${escapeLike(word)}%`;
    const orSql = fields.map((f) => `${f} LIKE ?`).join(" OR ");
    parts.push(`(${orSql})`);
    for (let i = 0; i < fields.length; i++) {
      params.push(like);
    }
  }
  return { sql: ` AND (${parts.join(" AND ")})`, params };
}

function buildSearch(q) {
  return buildSearchOnFields(q, SEARCH_FIELDS);
}

/**
 * Jewel loan picker quick syntax: #123 → id; @ravi → name only; else → all search fields.
 */
function parsePickerQuickQuery(qRaw) {
  const raw = String(qRaw || "").trim();
  if (!raw) return { kind: "none" };
  if (raw.startsWith("#")) {
    const rest = raw.slice(1).trim();
    if (/^\d+$/.test(rest)) return { kind: "id", id: Number(rest) };
    return { kind: "id", id: null };
  }
  if (raw.startsWith("@")) {
    return { kind: "name", term: raw.slice(1).trim() };
  }
  return { kind: "all", q: raw };
}

/** Field-specific filters from query string (detail search). */
function buildDetailFilters(q) {
  const parts = [];
  const params = [];
  const name = String(q.name || "").trim();
  if (name) {
    parts.push("c.name LIKE ?");
    params.push(`%${escapeLike(name)}%`);
  }
  const fatherName = String(q.fatherName || "").trim();
  if (fatherName) {
    parts.push("c.father_name LIKE ?");
    params.push(`%${escapeLike(fatherName)}%`);
  }
  const address = String(q.address || "").trim();
  if (address) {
    parts.push("c.address LIKE ?");
    params.push(`%${escapeLike(address)}%`);
  }
  const mobile = String(q.mobile || "").trim();
  if (mobile) {
    const like = `%${escapeLike(mobile)}%`;
    parts.push("(c.mobile1 LIKE ? OR c.mobile2 LIKE ?)");
    params.push(like, like);
  }
  const placeId = q.placeId != null && String(q.placeId).trim() !== ""
    ? Number(q.placeId)
    : null;
  if (placeId != null && Number.isFinite(placeId) && placeId > 0) {
    parts.push("c.place_id = ?");
    params.push(placeId);
  }
  const pan = String(q.pan || "").trim();
  if (pan) {
    parts.push("c.pan_number LIKE ?");
    params.push(`%${escapeLike(pan)}%`);
  }
  const aadhar = String(q.aadhar || "").trim();
  if (aadhar) {
    parts.push("c.aadhar_number LIKE ?");
    params.push(`%${escapeLike(aadhar)}%`);
  }
  const pinCode = String(q.pinCode || "").trim();
  if (pinCode) {
    parts.push("c.pin_code LIKE ?");
    params.push(`%${escapeLike(pinCode)}%`);
  }
  if (!parts.length) return { sql: "", params: [] };
  return { sql: ` AND (${parts.join(" AND ")})`, params };
}

function parseCustomerBody(body) {
  return {
    name: String(body?.name ?? "").trim(),
    fatherName: String(body?.fatherName ?? "").trim(),
    address: String(body?.address ?? "").trim(),
    placeId: Number(body?.placeId),
    panNumber:
      body?.panNumber != null && String(body.panNumber).trim()
        ? String(body.panNumber).trim()
        : null,
    aadharNumber:
      body?.aadharNumber != null && String(body.aadharNumber).trim()
        ? String(body.aadharNumber).trim()
        : null,
    pinCode:
      body?.pinCode != null && String(body.pinCode).trim()
        ? String(body.pinCode).trim()
        : null,
    mobile1:
      body?.mobile1 != null && String(body.mobile1).trim()
        ? String(body.mobile1).trim()
        : null,
    mobile2:
      body?.mobile2 != null && String(body.mobile2).trim()
        ? String(body.mobile2).trim()
        : null,
    comments:
      body?.comments != null ? String(body.comments).trim() || null : null,
    referencesComment:
      body?.referencesComment != null
        ? String(body.referencesComment).trim() || null
        : null,
    referredByCustomerId: (() => {
      const v = body?.referredByCustomerId;
      if (v == null || String(v).trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })(),
  };
}

function validateCustomer(p) {
  if (!p.name) return "name is required";
  if (!p.fatherName) return "father name is required";
  if (!p.address) return "address is required";
  if (!p.placeId) return "place is required";
  return null;
}

async function moveProofsToCustomerDir(customerId, files) {
  if (!files) return {};
  const updates = {};
  const dir = path.join(config.uploadRoot, "customers", String(customerId));
  await fs.mkdir(dir, { recursive: true });
  const mapping = [
    ["addressProof", "address_proof_file"],
    ["panProof", "pan_proof_file"],
    ["aadharProof", "aadhar_proof_file"],
    ["customerPhoto", "photo_file"],
  ];
  for (const [field, col] of mapping) {
    const arr = files[field];
    if (!arr?.length) continue;
    const f = arr[0];
    const dest = path.join(dir, path.basename(f.path));
    await fs.rename(f.path, dest);
    updates[col] = path.relative(config.uploadRoot, dest).replace(/\\/g, "/");
  }
  return updates;
}

async function unlinkProof(relPath) {
  if (!relPath) return;
  const full = path.join(config.uploadRoot, relPath);
  try {
    await fs.unlink(full);
  } catch {
    /* ignore */
  }
}

function mapRow(r) {
  return {
    id: num(r.id),
    name: r.name,
    fatherName: r.father_name,
    address: r.address,
    hasAddressProof: !!r.address_proof_file,
    hasPanProof: !!r.pan_proof_file,
    hasAadharProof: !!r.aadhar_proof_file,
    hasCustomerPhoto: !!r.photo_file,
    placeId: num(r.place_id),
    placeName: r.place_name ?? null,
    placeInitial: r.place_initial ?? null,
    panNumber: r.pan_number,
    aadharNumber: r.aadhar_number,
    pinCode: r.pin_code,
    mobile1: r.mobile1,
    mobile2: r.mobile2,
    comments: r.comments,
    referencesComment: r.references_comment,
    referredByCustomerId: r.referred_by_customer_id != null ? num(r.referred_by_customer_id) : null,
    referrerName: r.referrer_name ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const listSql = `
  SELECT c.*, p.name AS place_name, p.initial AS place_initial, ref.name AS referrer_name
  FROM customers c
  JOIN places p ON p.id = c.place_id
  LEFT JOIN customers ref ON ref.id = c.referred_by_customer_id
  WHERE 1=1
`;

customersRouter.get("/referrers", authRequired, async (req, res, next) => {
  try {
    const q = req.query.q;
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
    const { sql: searchSql, params: searchParams } = buildSearch(q || "");
    let sql = listSql;
    const params = [];
    if (excludeId) {
      sql += " AND c.id <> ?";
      params.push(excludeId);
    }
    sql += searchSql;
    params.push(...searchParams);
    sql += " ORDER BY c.name ASC LIMIT 200";
    const rows = await pool.query(sql, params);
    res.json(
      rows.map((r) => ({
        id: num(r.id),
        name: r.name,
        mobile1: r.mobile1,
        placeName: r.place_name,
      }))
    );
  } catch (e) {
    next(e);
  }
});

customersRouter.get("/", authRequired, async (req, res, next) => {
  try {
    const { sql: searchSql, params: searchParams } = buildSearch(req.query.q);
    const { sql: detailSql, params: detailParams } = buildDetailFilters(
      req.query
    );
    const whereSuffix = `${searchSql}${detailSql}`;
    const listParams = [...searchParams, ...detailParams];
    const pageSize = await getCustomerListPageSize();
    const countSql = `
      SELECT COUNT(*) AS c
      FROM customers c
      JOIN places p ON p.id = c.place_id
      LEFT JOIN customers ref ON ref.id = c.referred_by_customer_id
      WHERE 1=1${whereSuffix}
    `;
    const countRows = await pool.query(countSql, listParams);
    const total = Number(countRows[0]?.c ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    let page = Number(req.query.page);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const offset = (page - 1) * pageSize;
    const sql = `${listSql}${whereSuffix} ORDER BY c.name ASC, c.id ASC LIMIT ? OFFSET ?`;
    const rows = await pool.query(sql, [...listParams, pageSize, offset]);
    res.json({
      items: rows.map(mapRow),
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (e) {
    next(e);
  }
});

/** Picker for jewel loan: #id, @name-only, or general q + optional detail filters. */
customersRouter.get("/picker", authRequired, async (req, res, next) => {
  try {
    const qRaw = String(req.query.q || "").trim();
    const { sql: detailSql, params: detailParams } = buildDetailFilters(req.query);
    const hasDetail = detailSql.length > 0;
    const quick = parsePickerQuickQuery(qRaw);

    if (quick.kind === "none" && !hasDetail) {
      return res.json([]);
    }

    let extra = "";
    const params = [];
    const orderSql = ` ORDER BY c.name ASC, c.id ASC LIMIT 80`;

    if (quick.kind === "id") {
      if (quick.id == null || !Number.isFinite(quick.id) || quick.id <= 0) {
        return res.json([]);
      }
      extra += ` AND c.id = ?`;
      params.push(quick.id);
    } else if (quick.kind === "name") {
      if (quick.term) {
        const { sql: searchSql, params: searchParams } = buildSearchOnFields(quick.term, [
          "c.name",
        ]);
        extra += searchSql;
        params.push(...searchParams);
      } else if (!hasDetail) {
        return res.json([]);
      }
    } else {
      const { sql: searchSql, params: searchParams } = buildSearch(quick.q);
      if (!searchSql && !hasDetail) {
        return res.json([]);
      }
      extra += searchSql;
      params.push(...searchParams);
    }

    extra += detailSql;
    params.push(...detailParams);

    const sql = `${listSql}${extra}${orderSql}`;
    const rows = await pool.query(sql, params);
    res.json(rows.map(mapRow));
  } catch (e) {
    next(e);
  }
});

customersRouter.get("/:id(\\d+)/file/:kind", authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const kind = req.params.kind;
    const colMap = {
      addressProof: "address_proof_file",
      panProof: "pan_proof_file",
      aadharProof: "aadhar_proof_file",
      customerPhoto: "photo_file",
    };
    const col = colMap[kind];
    if (!col) {
      return res.status(400).json({ error: "Invalid file kind" });
    }
    const rows = await pool.query(
      `SELECT ${col} AS f FROM customers WHERE id = ?`,
      [id]
    );
    const rel = rows[0]?.f;
    if (!rel) {
      return res.status(404).json({ error: "File not found" });
    }
    const full = path.resolve(config.uploadRoot, rel);
    const root = path.resolve(config.uploadRoot);
    if (!full.startsWith(root)) {
      return res.status(403).end();
    }
    res.sendFile(full, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (e) {
    next(e);
  }
});

customersRouter.get("/:id(\\d+)", authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await pool.query(`${listSql} AND c.id = ?`, [id]);
    const r = rows[0];
    if (!r) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(mapRow(r));
  } catch (e) {
    next(e);
  }
});

function runUpload(req, res, next) {
  uploadCustomerFiles(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}

customersRouter.post("/", authRequired, runUpload, async (req, res, next) => {
  let customerId;
  try {
    const p = parseCustomerBody(req.body);
    const errMsg = validateCustomer(p);
    if (errMsg) {
      await cleanupMulterFiles(req);
      return res.status(400).json({ error: errMsg });
    }
    if (
      p.referredByCustomerId &&
      Number.isFinite(p.referredByCustomerId)
    ) {
      const ref = await pool.query("SELECT id FROM customers WHERE id = ?", [
        p.referredByCustomerId,
      ]);
      if (!ref.length) {
        await cleanupMulterFiles(req);
        return res.status(400).json({ error: "Invalid referred customer" });
      }
    }

    const result = await pool.query(
      `INSERT INTO customers (
        name, father_name, address, place_id, pan_number, aadhar_number,
        pin_code, mobile1, mobile2, comments, references_comment, referred_by_customer_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.name,
        p.fatherName,
        p.address,
        p.placeId,
        p.panNumber,
        p.aadharNumber,
        p.pinCode,
        p.mobile1,
        p.mobile2,
        p.comments,
        p.referencesComment,
        p.referredByCustomerId,
      ]
    );
    customerId = num(result.insertId);

    const proofUpdates = await moveProofsToCustomerDir(customerId, req.files);
    const sets = Object.keys(proofUpdates);
    if (sets.length) {
      const frag = sets.map((k) => `${k} = ?`).join(", ");
      await pool.query(
        `UPDATE customers SET ${frag} WHERE id = ?`,
        [...sets.map((k) => proofUpdates[k]), customerId]
      );
    }

    const rows = await pool.query(`${listSql} AND c.id = ?`, [customerId]);
    res.status(201).json(mapRow(rows[0]));
  } catch (e) {
    if (customerId) {
      await fs.rm(
        path.join(config.uploadRoot, "customers", String(customerId)),
        { recursive: true, force: true }
      ).catch(() => {});
      await pool.query("DELETE FROM customers WHERE id = ?", [customerId]).catch(() => {});
    }
    next(e);
  }
});

customersRouter.put(
  "/:id(\\d+)",
  authRequired,
  runUpload,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const p = parseCustomerBody(req.body);
      const errMsg = validateCustomer(p);
      if (errMsg) {
        await cleanupMulterFiles(req);
        return res.status(400).json({ error: errMsg });
      }
      if (p.referredByCustomerId === id) {
        await cleanupMulterFiles(req);
        return res.status(400).json({ error: "Customer cannot refer themselves" });
      }
      if (p.referredByCustomerId) {
        const ref = await pool.query("SELECT id FROM customers WHERE id = ?", [
          p.referredByCustomerId,
        ]);
        if (!ref.length) {
          await cleanupMulterFiles(req);
          return res.status(400).json({ error: "Invalid referred customer" });
        }
      }

      const existing = await pool.query(
        `SELECT address_proof_file, pan_proof_file, aadhar_proof_file, photo_file FROM customers WHERE id = ?`,
        [id]
      );
      if (!existing.length) {
        await cleanupMulterFiles(req);
        return res.status(404).json({ error: "Not found" });
      }

      const prev = existing[0];
      const proofUpdates = await moveProofsToCustomerDir(id, req.files);

      if (proofUpdates.address_proof_file) {
        await unlinkProof(prev.address_proof_file);
      }
      if (proofUpdates.pan_proof_file) {
        await unlinkProof(prev.pan_proof_file);
      }
      if (proofUpdates.aadhar_proof_file) {
        await unlinkProof(prev.aadhar_proof_file);
      }
      if (proofUpdates.photo_file) {
        await unlinkProof(prev.photo_file);
      }

      await pool.query(
        `UPDATE customers SET
          name = ?, father_name = ?, address = ?, place_id = ?,
          pan_number = ?, aadhar_number = ?, pin_code = ?, mobile1 = ?, mobile2 = ?,
          comments = ?, references_comment = ?, referred_by_customer_id = ?
          ${Object.keys(proofUpdates).length ? ", " + Object.keys(proofUpdates).map((k) => `${k} = ?`).join(", ") : ""}
        WHERE id = ?`,
        [
          p.name,
          p.fatherName,
          p.address,
          p.placeId,
          p.panNumber,
          p.aadharNumber,
          p.pinCode,
          p.mobile1,
          p.mobile2,
          p.comments,
          p.referencesComment,
          p.referredByCustomerId,
          ...(Object.keys(proofUpdates).map((k) => proofUpdates[k]) || []),
          id,
        ]
      );

      const rows = await pool.query(`${listSql} AND c.id = ?`, [id]);
      res.json(mapRow(rows[0]));
    } catch (e) {
      next(e);
    }
  }
);

customersRouter.delete("/:id(\\d+)", authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query("DELETE FROM customers WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    await fs.rm(path.join(config.uploadRoot, "customers", String(id)), {
      recursive: true,
      force: true,
    }).catch(() => {});
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
