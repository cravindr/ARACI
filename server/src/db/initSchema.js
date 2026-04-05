import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

/**
 * Default jewel-pledge terms (English; Tamil Nadu / India microfinance style, lender-favouring).
 * Applied when `customer_copy_terms_html` is empty; editable in admin Configuration.
 */
const DEFAULT_CUSTOMER_COPY_TERMS_HTML = `<p><strong>Terms and conditions</strong> (jewel pledge — Tamil Nadu, India)</p>
<p>The borrower acknowledges that the pledged jewel(s) are security for this loan. The following terms apply and are agreed <strong>in favour of the lender (owner)</strong> of the pledged article(s), subject to applicable law:</p>
<ul>
<li><strong>Twelve-month obligation:</strong> Within <strong>12 (twelve) months</strong> from the date of this loan, the borrower shall <strong>either</strong> (a) redeem the pledged jewel(s) by repaying the principal and all amounts due in full, <strong>or</strong> (b) pay <strong>all interest and charges due</strong> within the said period as per the lender’s schedule or renewal policy, so the account is kept regular. <strong>If the jewel(s) are not redeemed within 12 months, or interest and charges are not paid in full within 12 months as required, whichever failure occurs first,</strong> the lender may treat the loan as <strong>in default</strong> and act as permitted below.</li>
<li><strong>Interest:</strong> Interest accrues at the rate stated on this customer copy until the loan is fully closed.</li>
<li><strong>Rights on default:</strong> On default, the lender may enforce the pledge and deal with the jewel(s) in accordance with <strong>Reserve Bank of India</strong> norms for microfinance, <strong>Tamil Nadu and central laws</strong> on microfinance, money lending, pledges, or secured lending as applicable, and this institution’s board-approved policy.</li>
<li><strong>Representations:</strong> The borrower warrants that the pledged articles are owned by the borrower, match the description given, and are free of undisclosed encumbrances.</li>
<li><strong>Costs:</strong> Reasonable notice, custody, auction, or enforcement costs allowed by law may be deducted from sale proceeds or recovered as per policy.</li>
</ul>
<p>The borrower has read, understood, and accepts the above.</p>`;

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

async function migrateCustomerPhotoColumn(conn) {
  const cols = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'photo_file'`
  );
  if (Number(cols[0].c) > 0) {
    return;
  }
  await conn.query(
    `ALTER TABLE customers ADD COLUMN photo_file VARCHAR(500) NULL AFTER aadhar_proof_file`
  );
}

/** Long HTML for customer copy / company blocks; widen from VARCHAR(255). */
async function migrateAppSettingsValueToMediumText(conn) {
  const cols = await conn.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_settings' AND COLUMN_NAME = 'setting_value'`
  );
  if (!cols.length) return;
  const t = String(cols[0].t || "").toLowerCase();
  if (t.includes("mediumtext") || t.includes("longtext")) return;
  await conn.query(
    `ALTER TABLE app_settings MODIFY COLUMN setting_value MEDIUMTEXT NOT NULL`
  );
}

async function seedDefaultCustomerCopyTermsIfEmpty(conn) {
  await conn.query(
    `UPDATE app_settings SET setting_value = ?
     WHERE setting_key = 'customer_copy_terms_html'
     AND (setting_value IS NULL OR CHAR_LENGTH(TRIM(setting_value)) = 0)`,
    [DEFAULT_CUSTOMER_COPY_TERMS_HTML]
  );
}

/** User-facing loan agreement / start datetime (DBs created before migration lack this column). */
async function migrateJewelLoansLoanAsOfColumn(conn) {
  const cols = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jewel_loans' AND COLUMN_NAME = 'loan_as_of'`
  );
  if (Number(cols[0].c) > 0) {
    return;
  }
  await conn.query(
    `ALTER TABLE jewel_loans ADD COLUMN loan_as_of DATETIME NULL AFTER jewel_worth_inr`
  );
}

async function migrateJewelLoanItemsWeightGramsColumn(conn) {
  const cols = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jewel_loan_items' AND COLUMN_NAME = 'weight_grams'`
  );
  if (Number(cols[0].c) > 0) {
    return;
  }
  await conn.query(
    `ALTER TABLE jewel_loan_items ADD COLUMN weight_grams DECIMAL(18,3) NULL AFTER quantity`
  );
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
        photo_file VARCHAR(500) NULL,
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

    await migrateCustomerPhotoColumn(conn);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await migrateAppSettingsValueToMediumText(conn);
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('customer_list_page_size', '10')`
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('jewel_loan_default_touch_pct', '91.6')`
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('jewel_loan_default_interest_rate', '2')`
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('company_name', '')`
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('company_address', '')`
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('company_licence_number', '')`
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('customer_copy_header_html', '')`
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('customer_copy_terms_html', ?)`,
      [DEFAULT_CUSTOMER_COPY_TERMS_HTML]
    );
    await conn.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('customer_copy_footer_html', '')`
    );
    await seedDefaultCustomerCopyTermsIfEmpty(conn);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS jewel_loans (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        customer_id INT UNSIGNED NOT NULL,
        total_weight DECIMAL(18,3) NOT NULL,
        touch_pct DECIMAL(10,3) NOT NULL DEFAULT 91.600,
        interest_rate DECIMAL(10,3) NOT NULL DEFAULT 2.000,
        loan_amount DECIMAL(18,2) NOT NULL,
        board_rate_inr_per_gram DECIMAL(18,2) NULL,
        jewel_worth_inr DECIMAL(18,2) NULL,
        loan_as_of DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_jewel_loans_customer (customer_id),
        CONSTRAINT fk_jewel_loans_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS jewel_loan_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        loan_id BIGINT UNSIGNED NOT NULL,
        jewel_type_id INT UNSIGNED NOT NULL,
        quantity INT UNSIGNED NOT NULL DEFAULT 1,
        weight_grams DECIMAL(18,3) NULL,
        KEY idx_jewel_loan_items_loan (loan_id),
        CONSTRAINT fk_jewel_loan_items_loan FOREIGN KEY (loan_id) REFERENCES jewel_loans(id) ON DELETE CASCADE,
        CONSTRAINT fk_jewel_loan_items_type FOREIGN KEY (jewel_type_id) REFERENCES jewel_types(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await migrateJewelLoansLoanAsOfColumn(conn);
    await migrateJewelLoanItemsWeightGramsColumn(conn);

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
