import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

/** Add `places.initial` for DBs created before this column existed. */
async function migratePlacesInitialColumn(conn) {
  const cols = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'places' AND COLUMN_NAME = 'initial'`
  );
  if (Number(cols[0].c) > 0) {
    return;
  }

  await conn.query(`ALTER TABLE places ADD COLUMN initial VARCHAR(2) NULL`);

  const places = await conn.query(`SELECT id FROM places ORDER BY id ASC`);
  for (const p of places) {
    const id = Number(p.id);
    const a = String.fromCharCode(65 + ((id - 1) % 26));
    const b = String.fromCharCode(65 + (Math.floor((id - 1) / 26) % 26));
    await conn.query(`UPDATE places SET initial = ? WHERE id = ?`, [a + b, id]);
  }

  await conn.query(
    `ALTER TABLE places MODIFY COLUMN initial VARCHAR(2) NOT NULL`
  );

  try {
    await conn.query(
      `CREATE UNIQUE INDEX uq_place_initial ON places (initial)`
    );
  } catch (e) {
    if (e.errno !== 1061 && e.code !== "ER_DUP_KEYNAME") {
      throw e;
    }
  }
}

export async function initSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role_id INT UNSIGNED NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS jewel_types (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description VARCHAR(500) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_jewel_type_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS places (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        initial CHAR(2) NOT NULL,
        description VARCHAR(500) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_place_name (name),
        UNIQUE KEY uq_place_initial (initial)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await migratePlacesInitialColumn(conn);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS gold_board_rate (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        rate DECIMAL(18,2) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS gold_board_rate_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        rate DECIMAL(18,2) NOT NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        comment VARCHAR(500) NOT NULL,
        KEY idx_gold_hist_changed (changed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(
      `ALTER TABLE gold_board_rate MODIFY COLUMN rate DECIMAL(18,2) NOT NULL`
    );
    await conn.query(
      `ALTER TABLE gold_board_rate_history MODIFY COLUMN rate DECIMAL(18,2) NOT NULL`
    );

    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        father_name VARCHAR(200) NOT NULL,
        address TEXT NOT NULL,
        address_proof_file VARCHAR(500) NULL,
        place_id INT UNSIGNED NOT NULL,
        pan_number VARCHAR(32) NULL,
        pan_proof_file VARCHAR(500) NULL,
        aadhar_number VARCHAR(32) NULL,
        aadhar_proof_file VARCHAR(500) NULL,
        pin_code VARCHAR(16) NULL,
        mobile1 VARCHAR(20) NULL,
        mobile2 VARCHAR(20) NULL,
        comments TEXT NULL,
        references_comment TEXT NULL,
        referred_by_customer_id INT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_customers_place (place_id),
        KEY idx_customers_referrer (referred_by_customer_id),
        CONSTRAINT fk_customers_place FOREIGN KEY (place_id) REFERENCES places(id),
        CONSTRAINT fk_customers_referrer FOREIGN KEY (referred_by_customer_id) REFERENCES customers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(
      `ALTER TABLE customers MODIFY COLUMN pin_code VARCHAR(16) NULL`
    );
    await conn.query(
      `ALTER TABLE customers MODIFY COLUMN mobile1 VARCHAR(20) NULL`
    );

    await conn.query(
      `INSERT IGNORE INTO roles (id, name) VALUES (1, 'Administrator'), (2, 'User');`
    );

    const rows = await conn.query(
      "SELECT COUNT(*) AS c FROM users WHERE role_id = 1"
    );
    const adminCount = rows[0].c;
    // MariaDB driver may return bigint; `0n === 0` is false in JS.
    const adminNum = Number(adminCount);
    if (adminNum === 0) {
      const hash = bcrypt.hashSync("Admin@123", 10);
      await conn.query(
        `INSERT INTO users (username, email, password_hash, role_id)
         VALUES ('admin', 'admin@localhost', ?, 1)`,
        [hash]
      );
    }
  } finally {
    conn.release();
  }
}
