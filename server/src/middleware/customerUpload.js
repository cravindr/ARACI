import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { config } from "../config.js";

const ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".bmp"]);

const tmpStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      const dir = path.join(config.uploadRoot, "tmp");
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "file", ext)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${base}${ext}`);
  },
});

const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".bmp"]);

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (file.fieldname === "customerPhoto") {
    if (!PHOTO_EXT.has(ext)) {
      cb(
        new Error(
          `Customer photo must be an image (.jpg, .jpeg, .png, .bmp), got "${ext}"`
        )
      );
      return;
    }
    cb(null, true);
    return;
  }
  if (!ALLOWED_EXT.has(ext)) {
    cb(
      new Error(
        `Invalid file type "${ext}". Allowed: .pdf, .jpg, .jpeg, .png, .bmp`
      )
    );
    return;
  }
  cb(null, true);
}

export const uploadCustomerFiles = multer({
  storage: tmpStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter,
}).fields([
  { name: "addressProof", maxCount: 1 },
  { name: "panProof", maxCount: 1 },
  { name: "aadharProof", maxCount: 1 },
  { name: "customerPhoto", maxCount: 1 },
]);
