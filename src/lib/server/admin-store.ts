import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.WFILEMANAGER_SQLITE_PATH || "/var/lib/wfilemanager/wfilemanager.db";
const INSTANCE_KEY = process.env.WFILEMANAGER_INSTANCE_KEY || "wfm-local";
const SESSION_SHORT_MS = 12 * 60 * 60 * 1000;
const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = "multi-user-v1";

export type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  status: "active" | "suspended";
  is_admin: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type LegacyAdminRow = {
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
    connection
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(name),
  );
}

function meta(connection: DatabaseSync, key: string) {
  const row = connection.prepare("SELECT value FROM wfm_meta WHERE key = ?").get(key) as
    { value?: string } | undefined;
  return row?.value || null;
}

function setMeta(connection: DatabaseSync, key: string, value: string) {
  connection
    .prepare(
      "INSERT INTO wfm_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

function createUserTable(connection: DatabaseSync, name = "wfm_users") {
  connection.exec(`
    CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function createSessionTable(connection: DatabaseSync) {
  connection.exec(`
    CREATE TABLE wfm_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES wfm_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX wfm_sessions_expires_at_idx ON wfm_sessions(expires_at);
    CREATE INDEX wfm_sessions_user_id_idx ON wfm_sessions(user_id);
  `);
}

function migrateLegacy(connection: DatabaseSync) {
  const previousSchema = meta(connection, "schema_version");
  if (previousSchema === SCHEMA_VERSION) return;

  connection.exec("PRAGMA foreign_keys = OFF");
  connection.exec("BEGIN IMMEDIATE");
  try {
    const legacyAdmin = tableExists(connection, "wfm_admin")
      ? (connection
          .prepare(
            `SELECT password_hash, password_salt, last_login_at, created_at, updated_at
             FROM wfm_admin WHERE id = 1`,
          )
          .get() as LegacyAdminRow | undefined)
      : tableExists(connection, "wfm_users")
        ? (connection
            .prepare(
              `SELECT password_hash, password_salt, last_login_at, created_at, updated_at
               FROM wfm_users WHERE is_admin = 1 ORDER BY created_at ASC LIMIT 1`,
            )
            .get() as LegacyAdminRow | undefined)
        : undefined;

    if (tableExists(connection, "wfm_users"))
      connection.exec("ALTER TABLE wfm_users RENAME TO wfm_users_legacy");
    createUserTable(connection);

    if (legacyAdmin) {
      connection
        .prepare(
          `INSERT INTO wfm_users(
             id, username, display_name, password_hash, password_salt, status, is_admin,
             last_login_at, created_at, updated_at
           ) VALUES('admin', 'admin', 'Administrator', ?, ?, 'active', 1, ?, ?, ?)`,
        )
        .run(
          legacyAdmin.password_hash,
          legacyAdmin.password_salt,
          legacyAdmin.last_login_at,
          legacyAdmin.created_at,
          legacyAdmin.updated_at,
        );
    }

    if (tableExists(connection, "wfm_sessions")) {
      connection.exec("ALTER TABLE wfm_sessions RENAME TO wfm_sessions_legacy");
      connection.exec(`
        DROP INDEX IF EXISTS wfm_sessions_expires_at_idx;
        DROP INDEX IF EXISTS wfm_sessions_user_id_idx;
      `);
    }
    createSessionTable(connection);
    if (
      previousSchema === "single-admin-v2" &&
      legacyAdmin &&
      tableExists(connection, "wfm_sessions_legacy")
    ) {
      connection.exec(`
        INSERT INTO wfm_sessions(id, user_id, token_hash, expires_at, created_at)
        SELECT id, 'admin', token_hash, expires_at, created_at FROM wfm_sessions_legacy;
      `);
    }

    connection.exec(`
      DROP TABLE IF EXISTS wfm_sessions_legacy;
      DROP TABLE IF EXISTS wfm_users_legacy;
      DROP TABLE IF EXISTS wfm_admin;
      DROP TABLE IF EXISTS wfm_path_rules;
      DROP TABLE IF EXISTS wfm_notifications;
      DROP TABLE IF EXISTS wfm_audit_logs;
      DROP TABLE IF EXISTS wfm_roles;
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
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS wfm_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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

function usernameValue(input: unknown) {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function requireValidUsername(input: unknown) {
  const username = usernameValue(input);
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username)) {
    throw new SqliteAuthError(
      400,
      "Username must be 3–32 characters and start with a letter. Use letters, numbers, dots, dashes or underscores.",
    );
  }
  return username;
}

function displayNameValue(input: unknown, username: string) {
  const displayName = String(input || username).trim();
  const hasControlCharacter = [...displayName].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!displayName || displayName.length > 80 || hasControlCharacter)
    throw new SqliteAuthError(400, "Display name must contain 1–80 characters.");
  return displayName;
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

function userById(id: string) {
  return db().prepare("SELECT * FROM wfm_users WHERE id = ?").get(id) as UserRow | undefined;
}

function userByUsername(username: string) {
  return db().prepare("SELECT * FROM wfm_users WHERE username = ?").get(username) as
    UserRow | undefined;
}

function requireUserById(id: string) {
  const value = userById(id);
  if (!value) throw new SqliteAuthError(404, "User not found.");
  return value;
}

function requireAdministrator(user: UserRow) {
  if (!user.is_admin) throw new SqliteAuthError(403, "Administrator access is required.");
}

function cleanExpiredSessions() {
  db().prepare("DELETE FROM wfm_sessions WHERE expires_at <= ?").run(now());
}

function revokeUserSessions(connection: DatabaseSync, userId: string, exceptToken = "") {
  if (exceptToken) {
    connection
      .prepare("DELETE FROM wfm_sessions WHERE user_id = ? AND token_hash <> ?")
      .run(userId, tokenHash(exceptToken));
    return;
  }
  connection.prepare("DELETE FROM wfm_sessions WHERE user_id = ?").run(userId);
}

export function isConfigured() {
  return meta(db(), "configured") === "true" && Boolean(userById("admin"));
}

export function instanceInfo() {
  return { id: INSTANCE_KEY, name: "wFileManager", databaseMode: "sqlite" as const };
}

export function userResponse(value: UserRow) {
  return {
    id: value.id,
    instanceId: INSTANCE_KEY,
    username: value.username,
    displayName: value.display_name,
    status: value.status,
    isAdmin: Boolean(value.is_admin),
    createdAt: value.created_at,
    lastLoginAt: value.last_login_at,
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
        `INSERT INTO wfm_users(
           id, username, display_name, password_hash, password_salt, status, is_admin,
           last_login_at, created_at, updated_at
         ) VALUES('admin', 'admin', 'Administrator', ?, ?, 'active', 1, NULL, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           password_hash=excluded.password_hash,
           password_salt=excluded.password_salt,
           status='active',
           updated_at=excluded.updated_at`,
      )
      .run(credential.hash, credential.salt, timestamp, timestamp);
    setMeta(connection, "configured", "true");
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return { success: true as const, user: userResponse(requireUserById("admin")) };
}

export function login(data: Record<string, unknown>) {
  if (!isConfigured()) throw new SqliteAuthError(409, "wFileManager setup is not complete.");
  const username = usernameValue(data.username || "admin");
  const value = userByUsername(username);
  const password = String(data.password || "");
  const candidateHash = passwordHash(password, value?.password_salt || "00".repeat(16));
  const credentialsMatch = safeEqual(candidateHash, value?.password_hash || "00".repeat(64));
  if (!value || value.status !== "active" || !credentialsMatch) {
    throw new SqliteAuthError(401, "Invalid username or password.");
  }

  cleanExpiredSessions();
  const token = randomBytes(48).toString("base64url");
  const createdAt = now();
  const expiresAt = new Date(
    Date.now() + (data.remember ? SESSION_LONG_MS : SESSION_SHORT_MS),
  ).toISOString();
  db()
    .prepare(
      "INSERT INTO wfm_sessions(id, user_id, token_hash, expires_at, created_at) VALUES(?, ?, ?, ?, ?)",
    )
    .run(randomBytes(16).toString("hex"), value.id, tokenHash(token), expiresAt, createdAt);
  db()
    .prepare("UPDATE wfm_users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .run(createdAt, createdAt, value.id);
  return { token, expiresAt, user: userResponse(requireUserById(value.id)) };
}

export function sessionUser(token: string) {
  if (!token) throw new SqliteAuthError(401, "Missing session token.");
  cleanExpiredSessions();
  const row = db()
    .prepare(
      `SELECT users.* FROM wfm_sessions sessions
       INNER JOIN wfm_users users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = 'active'
       LIMIT 1`,
    )
    .get(tokenHash(token), now()) as UserRow | undefined;
  if (!row) throw new SqliteAuthError(401, "Your wFileManager session is invalid or expired.");
  return row;
}

export function logout(token: string) {
  if (token) db().prepare("DELETE FROM wfm_sessions WHERE token_hash = ?").run(tokenHash(token));
  return { success: true as const };
}

export function verifyPassword(user: UserRow, password: string) {
  const value = requireUserById(user.id);
  if (!safeEqual(passwordHash(password, value.password_salt), value.password_hash))
    throw new SqliteAuthError(401, "The password is incorrect.");
  return true;
}

export function changePassword(user: UserRow, data: Record<string, unknown>, currentToken: string) {
  const value = requireUserById(user.id);
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
      .prepare(
        "UPDATE wfm_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
      )
      .run(credential.hash, credential.salt, now(), value.id);
    revokeUserSessions(connection, value.id, currentToken);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return { success: true as const };
}

export function listUsers(administrator: UserRow) {
  requireAdministrator(administrator);
  return (
    db()
      .prepare(
        `SELECT * FROM wfm_users
         ORDER BY is_admin DESC, username COLLATE NOCASE ASC`,
      )
      .all() as unknown as UserRow[]
  ).map(userResponse);
}

export function createUser(administrator: UserRow, data: Record<string, unknown>) {
  requireAdministrator(administrator);
  const username = requireValidUsername(data.username);
  if (username === "admin") throw new SqliteAuthError(409, "The admin username is reserved.");
  const displayName = displayNameValue(data.displayName, username);
  const password = String(data.password || "");
  const policyError = passwordPolicyError(password);
  if (policyError) throw new SqliteAuthError(400, policyError);
  const credential = newPassword(password);
  const timestamp = now();
  const id = randomBytes(16).toString("hex");
  try {
    db()
      .prepare(
        `INSERT INTO wfm_users(
           id, username, display_name, password_hash, password_salt, status, is_admin,
           last_login_at, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, 'active', 0, NULL, ?, ?)`,
      )
      .run(id, username, displayName, credential.hash, credential.salt, timestamp, timestamp);
  } catch (error) {
    if (String((error as Error).message).includes("UNIQUE"))
      throw new SqliteAuthError(409, "That username already exists.");
    throw error;
  }
  return userResponse(requireUserById(id));
}

function requireManagedUser(administrator: UserRow, id: unknown) {
  requireAdministrator(administrator);
  const target = requireUserById(String(id || ""));
  if (target.is_admin)
    throw new SqliteAuthError(400, "The administrator account cannot be managed here.");
  return target;
}

export function resetUserPassword(administrator: UserRow, data: Record<string, unknown>) {
  const target = requireManagedUser(administrator, data.userId);
  const password = String(data.password || "");
  const policyError = passwordPolicyError(password);
  if (policyError) throw new SqliteAuthError(400, policyError);
  const credential = newPassword(password);
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection
      .prepare(
        "UPDATE wfm_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
      )
      .run(credential.hash, credential.salt, now(), target.id);
    revokeUserSessions(connection, target.id);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return { success: true as const };
}

export function setUserSuspended(administrator: UserRow, data: Record<string, unknown>) {
  const target = requireManagedUser(administrator, data.userId);
  if (typeof data.suspended !== "boolean")
    throw new SqliteAuthError(400, "A suspension state is required.");
  const suspended = data.suspended;
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection
      .prepare("UPDATE wfm_users SET status = ?, updated_at = ? WHERE id = ?")
      .run(suspended ? "suspended" : "active", now(), target.id);
    if (suspended) revokeUserSessions(connection, target.id);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return userResponse(requireUserById(target.id));
}

export function deleteUser(administrator: UserRow, data: Record<string, unknown>) {
  const target = requireManagedUser(administrator, data.userId);
  db().prepare("DELETE FROM wfm_users WHERE id = ?").run(target.id);
  return { success: true as const };
}
