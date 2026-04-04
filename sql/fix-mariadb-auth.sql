-- Dev fix when Node reports: auth_gssapi_client / ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED
-- Run in mariadb/mysql client (e.g. HeidiSQL) using an account that can still log in.

-- Prefer: switch root@localhost to password authentication, then keep server/.env as DB_USER=root
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('addfgf');
FLUSH PRIVILEGES;

-- Optional: app-only user (must create DB first or grant CREATE; for simple dev, fixing root is easier)
-- CREATE DATABASE IF NOT EXISTS microfinance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER IF NOT EXISTS 'microfinance'@'localhost' IDENTIFIED BY 'addfgf';
-- GRANT ALL PRIVILEGES ON microfinance.* TO 'microfinance'@'localhost';
-- FLUSH PRIVILEGES;
-- Then set server/.env DB_USER=microfinance and remove automatic CREATE DATABASE if you use a user without that right.
