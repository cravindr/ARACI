import { createConnection } from "mariadb";
import { config } from "../config.js";

export async function ensureDatabaseExists() {
  let conn;
  try {
    conn = await createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
    });
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    if (conn) await conn.end();
  }
}
