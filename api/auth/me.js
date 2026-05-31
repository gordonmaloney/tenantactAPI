import { setCors } from "../_cors.js";
import { ensureAuth, publicUser } from "../_auth.js";
import { methodNotAllowed, sendJson } from "../_http.js";

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "OPTIONS"]);

  const user = await ensureAuth(req, res);
  if (!user) return;

  return sendJson(res, 200, { user: publicUser(user) });
}
