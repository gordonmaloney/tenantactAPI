import { getDb } from "./_db.js";
import { setCors } from "./_cors.js";
import {
  authRateLimit,
  createToken,
  ensureAuth,
  ensureAuthIndexes,
  hashPassword,
  normalizeEmail,
  publicUser,
  validateEmail,
  verifyPassword,
} from "./_auth.js";
import { getJsonBody, methodNotAllowed, sendJson } from "./_http.js";

function routePath(req) {
  const path = req.query?.path;
  if (Array.isArray(path)) return path[0] || "";
  return String(path || "").replace(/^\/+|\/+$/g, "");
}

async function signup(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);
  if (!authRateLimit(req, res)) return;

  const body = await getJsonBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 120);

  if (!validateEmail(email)) return sendJson(res, 400, { error: "invalid_email" });
  if (password.length < 12 || password.length > 256) {
    return sendJson(res, 400, {
      error: "invalid_password",
      message: "Password must be at least 12 characters.",
    });
  }

  const db = await getDb();
  await ensureAuthIndexes(db);

  const now = new Date();
  const user = {
    email,
    name,
    passwordHash: await hashPassword(password),
    role: "user",
    createdAt: now,
    updatedAt: now,
  };

  let result;
  try {
    result = await db.collection("users").insertOne(user);
  } catch (err) {
    if (err?.code === 11000) return sendJson(res, 409, { error: "email_unavailable" });
    throw err;
  }

  const savedUser = { ...user, _id: result.insertedId };
  return sendJson(res, 201, {
    token: createToken(savedUser),
    user: publicUser(savedUser),
  });
}

async function login(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);
  if (!authRateLimit(req, res)) return;

  const body = await getJsonBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!validateEmail(email) || !password) {
    return sendJson(res, 401, { error: "invalid_credentials" });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ email });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return sendJson(res, 401, { error: "invalid_credentials" });
  }

  return sendJson(res, 200, {
    token: createToken(user),
    user: publicUser(user),
  });
}

async function me(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "OPTIONS"]);

  const user = await ensureAuth(req, res);
  if (!user) return;

  return sendJson(res, 200, { user: publicUser(user) });
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const path = routePath(req);
    if (path === "signup") return signup(req, res);
    if (path === "login") return login(req, res);
    if (path === "me") return me(req, res);

    return sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    console.error("auth_route_error", err?.message);
    const status = err?.statusCode || 500;
    return sendJson(res, status, { error: status === 400 ? "invalid_json" : "server_error" });
  }
}
