import { createPool } from "mariadb";
import { config } from "../config.js";

export const pool = createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: 10,
  insertIdAsNumber: true,
});
