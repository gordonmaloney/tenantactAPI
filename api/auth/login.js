import { getDb } from "../_db.js";
import { setCors } from "../_cors.js";
import { authRateLimit, createToken, normalizeEmail, publicUser, verifyPassword, validateEmail } from "../_auth.js";
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
  } catch (err) {
    console.error("login_error", err?.message);
    const status = err?.statusCode || 500;
    return sendJson(res, status, { error: status === 400 ? "invalid_json" : "server_error" });
  }
}
