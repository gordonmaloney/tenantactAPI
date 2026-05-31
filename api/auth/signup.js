import { getDb } from "../_db.js";
import { setCors } from "../_cors.js";
import { authRateLimit, createToken, ensureAuthIndexes, hashPassword, normalizeEmail, publicUser, validateEmail } from "../_auth.js";
import { getJsonBody, methodNotAllowed, sendJson } from "../_http.js";

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);
  if (!authRateLimit(req, res)) return;

  try {
    const body = await getJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const name = String(body.name || "").trim().slice(0, 120);

    if (!validateEmail(email)) return sendJson(res, 400, { error: "invalid_email" });
    if (password.length < 12 || password.length > 256) {
      return sendJson(res, 400, { error: "invalid_password", message: "Password must be at least 12 characters." });
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
  } catch (err) {
    console.error("signup_error", err?.message);
    const status = err?.statusCode || 500;
    return sendJson(res, status, { error: status === 400 ? "invalid_json" : "server_error" });
  }
}
