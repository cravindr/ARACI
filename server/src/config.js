import "dotenv/config";
import path from "path";

export const config = {
  uploadRoot: process.env.UPLOAD_ROOT || path.join(process.cwd(), "uploads"),

  port: Number(process.env.PORT) || 4000,
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "microfinance",
  },
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret",
  jwtExpires: "7d",
};
