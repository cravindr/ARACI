import { pool } from "./db/pool.js";

const CUSTOMER_LIST_PAGE_SIZE_KEY = "customer_list_page_size";
const JEWEL_DEFAULT_TOUCH_KEY = "jewel_loan_default_touch_pct";
const JEWEL_DEFAULT_INTEREST_KEY = "jewel_loan_default_interest_rate";
const COMPANY_NAME_KEY = "company_name";
const COMPANY_ADDRESS_KEY = "company_address";
const COMPANY_LICENCE_KEY = "company_licence_number";
const COPY_HEADER_HTML_KEY = "customer_copy_header_html";
const COPY_TERMS_HTML_KEY = "customer_copy_terms_html";
const COPY_FOOTER_HTML_KEY = "customer_copy_footer_html";
const DEFAULT_PAGE_SIZE = 10;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 200;
const FALLBACK_JEWEL_DEFAULT_TOUCH = 91.6;
const FALLBACK_JEWEL_DEFAULT_INTEREST = 2;
const MAX_COMPANY_FIELD_LEN = 500;
const MAX_COMPANY_ADDRESS_LEN = 2000;
/** Keeps payload reasonable; MEDIUMTEXT allows more if you raise this. */
const MAX_RICH_HTML_LEN = 100_000;

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

export function clampCustomerListPageSize(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(x)));
}

export async function getCustomerListPageSize() {
  const rows = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = ?`,
    [CUSTOMER_LIST_PAGE_SIZE_KEY]
  );
  if (!rows.length) return DEFAULT_PAGE_SIZE;
  return clampCustomerListPageSize(rows[0].setting_value);
}

export async function setCustomerListPageSize(n) {
  const v = clampCustomerListPageSize(n);
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [CUSTOMER_LIST_PAGE_SIZE_KEY, String(v)]
  );
  return v;
}

export async function getJewelLoanDefaultTouchPct() {
  const rows = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = ?`,
    [JEWEL_DEFAULT_TOUCH_KEY]
  );
  if (!rows.length) return FALLBACK_JEWEL_DEFAULT_TOUCH;
  const x = round3(rows[0].setting_value);
  if (!Number.isFinite(x) || x <= 0 || x > 100) return FALLBACK_JEWEL_DEFAULT_TOUCH;
  return x;
}

export async function getJewelLoanDefaultInterestRate() {
  const rows = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = ?`,
    [JEWEL_DEFAULT_INTEREST_KEY]
  );
  if (!rows.length) return FALLBACK_JEWEL_DEFAULT_INTEREST;
  const x = round3(rows[0].setting_value);
  if (!Number.isFinite(x) || x < 0) return FALLBACK_JEWEL_DEFAULT_INTEREST;
  return x;
}

export async function setJewelLoanDefaultTouchPct(raw) {
  const x = round3(raw);
  if (!Number.isFinite(x) || x <= 0 || x > 100) {
    const err = new Error("Touch % must be between 0 and 100");
    err.statusCode = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [JEWEL_DEFAULT_TOUCH_KEY, String(x)]
  );
  return x;
}

export async function setJewelLoanDefaultInterestRate(raw) {
  const x = round3(raw);
  if (!Number.isFinite(x) || x < 0) {
    const err = new Error("Interest rate must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [JEWEL_DEFAULT_INTEREST_KEY, String(x)]
  );
  return x;
}

async function getTextSetting(key) {
  const rows = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = ?`,
    [key]
  );
  if (!rows.length) return "";
  const v = rows[0].setting_value;
  return v != null ? String(v) : "";
}

async function setTextSetting(key, raw, maxLen) {
  const s = raw == null ? "" : String(raw).trimEnd();
  if (s.length > maxLen) {
    const err = new Error(`Value exceeds maximum length (${maxLen})`);
    err.statusCode = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, s]
  );
  return s;
}

async function setHtmlSetting(key, raw) {
  const s = raw == null ? "" : String(raw);
  if (s.length > MAX_RICH_HTML_LEN) {
    const err = new Error(`HTML block exceeds maximum length (${MAX_RICH_HTML_LEN})`);
    err.statusCode = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, s]
  );
  return s;
}

export async function getCompanyName() {
  return getTextSetting(COMPANY_NAME_KEY);
}

export async function getCompanyAddress() {
  return getTextSetting(COMPANY_ADDRESS_KEY);
}

export async function getCompanyLicenceNumber() {
  return getTextSetting(COMPANY_LICENCE_KEY);
}

export async function getCustomerCopyHeaderHtml() {
  return getTextSetting(COPY_HEADER_HTML_KEY);
}

export async function getCustomerCopyTermsHtml() {
  return getTextSetting(COPY_TERMS_HTML_KEY);
}

export async function getCustomerCopyFooterHtml() {
  return getTextSetting(COPY_FOOTER_HTML_KEY);
}

export async function setCompanyName(raw) {
  const s = raw == null ? "" : String(raw).trim();
  if (s.length > MAX_COMPANY_FIELD_LEN) {
    const err = new Error("Company name is too long");
    err.statusCode = 400;
    throw err;
  }
  return setTextSetting(COMPANY_NAME_KEY, s, MAX_COMPANY_FIELD_LEN);
}

export async function setCompanyAddress(raw) {
  const s = raw == null ? "" : String(raw).trimEnd();
  if (s.length > MAX_COMPANY_ADDRESS_LEN) {
    const err = new Error("Company address is too long");
    err.statusCode = 400;
    throw err;
  }
  return setTextSetting(COMPANY_ADDRESS_KEY, s, MAX_COMPANY_ADDRESS_LEN);
}

export async function setCompanyLicenceNumber(raw) {
  const s = raw == null ? "" : String(raw).trim();
  if (s.length > MAX_COMPANY_FIELD_LEN) {
    const err = new Error("Licence number is too long");
    err.statusCode = 400;
    throw err;
  }
  return setTextSetting(COMPANY_LICENCE_KEY, s, MAX_COMPANY_FIELD_LEN);
}

export async function setCustomerCopyHeaderHtml(raw) {
  return setHtmlSetting(COPY_HEADER_HTML_KEY, raw);
}

export async function setCustomerCopyTermsHtml(raw) {
  return setHtmlSetting(COPY_TERMS_HTML_KEY, raw);
}

export async function setCustomerCopyFooterHtml(raw) {
  return setHtmlSetting(COPY_FOOTER_HTML_KEY, raw);
}
