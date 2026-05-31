import crypto from "crypto";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDb } from "./_db.js";
import { sendJson } from "./_http.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const rateLimitBuckets = new Map();

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return secret;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name || "",
    role: user.role || "user",
    createdAt: user.createdAt,
  };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

export function createToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: String(user._id),
    email: user.email,
    role: user.role || "user",
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  return `${unsigned}.${sign(unsigned, getJwtSecret())}`;
}

export function verifyToken(token) {
  const [header, payload, signature] = String(token || "").split(".");
  if (!header || !payload || !signature) return null;
  const unsigned = `${header}.${payload}`;
  if (!timingSafeEqualString(sign(unsigned, getJwtSecret()), signature)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded.sub || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function ensureAuth(req, res) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }

  let payload;
  try {
    payload = verifyToken(match[1]);
  } catch (err) {
    console.error("auth_config_error", err?.message);
    sendJson(res, 500, { error: "server_error" });
    return null;
  }

  if (!payload || !ObjectId.isValid(payload.sub)) {
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(payload.sub) });
  if (!user) {
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }
  req.user = user;
  return user;
}

export function authRateLimit(req, res) {
  const max = Number(process.env.AUTH_RATE_LIMIT_MAX) || 20;
  const windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
  const ip =
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const key = `${ip}:${Math.floor(Date.now() / windowMs)}`;
  const count = (rateLimitBuckets.get(key) || 0) + 1;
  rateLimitBuckets.set(key, count);

  if (rateLimitBuckets.size > 10000) {
    for (const bucket of rateLimitBuckets.keys()) {
      if (!bucket.endsWith(`:${Math.floor(Date.now() / windowMs)}`)) rateLimitBuckets.delete(bucket);
    }
  }

  if (count > max) {
    sendJson(res, 429, { error: "rate_limited" });
    return false;
  }
  return true;
}

export async function ensureAuthIndexes(db) {
  await db.collection("users").createIndexes([
    { key: { email: 1 }, unique: true },
    { key: { createdAt: -1 } },
  ]);
}
