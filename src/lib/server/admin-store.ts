import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.WFILEMANAGER_SQLITE_PATH || "/var/lib/wfilemanager/wfilemanager.db";
const INSTANCE_KEY = process.env.WFILEMANAGER_INSTANCE_KEY || "wfm-local";
const SESSION_SHORT_MS = 12 * 60 * 60 * 1000;
const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = "single-admin-v2";

type AdminRow = {
  id: number;
  password_hash: string;
  password_salt: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export class SqliteAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let database: DatabaseSync | null = null;

function now() {
  return new Date().toISOString();
}

function tableExists(connection: DatabaseSync, name: string) {
  return Boolean(
    connection.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1").get(name),
  );
}

function meta(connection: DatabaseSync, key: string) {
  const row = connection.prepare("SELECT value FROM wfm_meta WHERE key = ?").get(key) as
    | { value?: string }
    | undefined;
  return row?.value || null;
}

function setMeta(connection: DatabaseSync, key: string, value: string) {
  connection
    .prepare(
      "INSERT INTO wfm_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

function migrateLegacy(connection: DatabaseSync) {
  if (meta(connection, "schema_version") === SCHEMA_VERSION) return;

  connection.exec("PRAGMA foreign_keys = OFF");
  connection.exec("BEGIN IMMEDIATE");
  try {
    const hasAdmin = Boolean(connection.prepare("SELECT id FROM wfm_admin WHERE id = 1").get());
    if (!hasAdmin && tableExists(connection, "wfm_users")) {
      const legacy = connection
        .prepare(
          `SELECT password_hash, password_salt, last_login_at, created_at, updated_at
           FROM wfm_users
           WHERE is_admin = 1
           ORDER BY created_at ASC
           LIMIT 1`,
        )
        .get() as Record<string, unknown> | undefined;
      if (legacy?.password_hash && legacy?.password_salt) {
        connection
          .prepare(
            `INSERT INTO wfm_admin(id, password_hash, password_salt, last_login_at, created_at, updated_at)
             VALUES(1, ?, ?, ?, ?, ?)`,
          )
          .run(
            String(legacy.password_hash),
            String(legacy.password_salt),
            legacy.last_login_at ? String(legacy.last_login_at) : null,
            String(legacy.created_at || now()),
            String(legacy.updated_at || now()),
          );
      }
    }

    connection.exec(`
      DROP TABLE IF EXISTS wfm_path_rules;
      DROP TABLE IF EXISTS wfm_notifications;
      DROP TABLE IF EXISTS wfm_audit_logs;
      DROP TABLE IF EXISTS wfm_sessions;
      DROP TABLE IF EXISTS wfm_users;
      DROP TABLE IF EXISTS wfm_roles;

      CREATE TABLE wfm_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX wfm_sessions_expires_at_idx ON wfm_sessions(expires_at);
    `);
    setMeta(connection, "schema_version", SCHEMA_VERSION);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  } finally {
    connection.exec("PRAGMA foreign_keys = ON");
  }
}

function db() {
  if (database) return database;
  mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS wfm_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wfm_admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  migrateLegacy(database);
  return database;
}

function passwordHash(password: string, salt: string) {
  return scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
}

function newPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: passwordHash(password, salt) };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordPolicyError(password: string) {
  if (password.length < 12) return "Password must contain at least 12 characters.";
  if (!/^[A-Za-z0-9]+$/.test(password))
    return "Password may contain only uppercase letters, lowercase letters and numbers.";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain a number.";
  if (/(.)\1/.test(password)) return "Password must not contain identical consecutive characters.";
  return null;
}

function admin() {
  return db().prepare("SELECT * FROM wfm_admin WHERE id = 1").get() as AdminRow | undefined;
}

function requireAdminRow() {
  const value = admin();
  if (!value) throw new SqliteAuthError(409, "wFileManager setup is not complete.");
  return value;
}

function cleanExpiredSessions() {
  db().prepare("DELETE FROM wfm_sessions WHERE expires_at <= ?").run(now());
}

export function isConfigured() {
  return meta(db(), "configured") === "true" && Boolean(admin());
}

export function instanceInfo() {
  return { id: INSTANCE_KEY, name: "wFileManager", databaseMode: "sqlite" as const };
}

export function userResponse(value: AdminRow) {
  return {
    id: "admin" as const,
    instanceId: INSTANCE_KEY,
    username: "admin" as const,
    displayName: "Administrator" as const,
    status: "active" as const,
    isAdmin: true as const,
    createdAt: value.created_at,
  };
}

export function setup(data: Record<string, unknown>) {
  if (isConfigured()) throw new SqliteAuthError(409, "wFileManager is already configured.");
  const password = String(data.password || "");
  const policyError = passwordPolicyError(password);
  if (policyError) throw new SqliteAuthError(400, policyError);

  const credential = newPassword(password);
  const timestamp = now();
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection
      .prepare(
        `INSERT INTO wfm_admin(id, password_hash, password_salt, last_login_at, created_at, updated_at)
         VALUES(1, ?, ?, NULL, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           password_hash=excluded.password_hash,
           password_salt=excluded.password_salt,
           updated_at=excluded.updated_at`,
      )
      .run(credential.hash, credential.salt, timestamp, timestamp);
    setMeta(connection, "configured", "true");
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return { success: true as const, user: userResponse(requireAdminRow()) };
}

export function login(data: Record<string, unknown>) {
  if (!isConfigured()) throw new SqliteAuthError(409, "wFileManager setup is not complete.");
  const value = requireAdminRow();
  const password = String(data.password || "");
  if (!safeEqual(passwordHash(password, value.password_salt), value.password_hash))
    throw new SqliteAuthError(401, "Invalid administrator password.");

  cleanExpiredSessions();
  const token = randomBytes(48).toString("base64url");
  const createdAt = now();
  const expiresAt = new Date(
    Date.now() + (data.remember ? SESSION_LONG_MS : SESSION_SHORT_MS),
  ).toISOString();
  db()
    .prepare("INSERT INTO wfm_sessions(id, token_hash, expires_at, created_at) VALUES(?, ?, ?, ?)")
    .run(randomBytes(16).toString("hex"), tokenHash(token), expiresAt, createdAt);
  db().prepare("UPDATE wfm_admin SET last_login_at = ?, updated_at = ? WHERE id = 1").run(createdAt, createdAt);
  return { token, expiresAt, user: userResponse(requireAdminRow()) };
}

export function sessionUser(token: string) {
  if (!token) throw new SqliteAuthError(401, "Missing session token.");
  cleanExpiredSessions();
  const row = db()
    .prepare("SELECT id FROM wfm_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1")
    .get(tokenHash(token), now());
  if (!row) throw new SqliteAuthError(401, "Your wFileManager session is invalid or expired.");
  return requireAdminRow();
}

export function logout(token: string) {
  if (token) db().prepare("DELETE FROM wfm_sessions WHERE token_hash = ?").run(tokenHash(token));
  return { success: true as const };
}

export function verifyPassword(_user: AdminRow, password: string) {
  const value = requireAdminRow();
  if (!safeEqual(passwordHash(password, value.password_salt), value.password_hash))
    throw new SqliteAuthError(401, "The password is incorrect.");
  return true;
}

export function changePassword(_user: AdminRow, data: Record<string, unknown>, currentToken: string) {
  const value = requireAdminRow();
  const currentPassword = String(data.currentPassword || "");
  const nextPassword = String(data.newPassword || "");
  verifyPassword(value, currentPassword);
  const policyError = passwordPolicyError(nextPassword);
  if (policyError) throw new SqliteAuthError(400, policyError);

  const credential = newPassword(nextPassword);
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection
      .prepare("UPDATE wfm_admin SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = 1")
      .run(credential.hash, credential.salt, now());
    connection.prepare("DELETE FROM wfm_sessions WHERE token_hash <> ?").run(tokenHash(currentToken));
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return { success: true as const };
}
