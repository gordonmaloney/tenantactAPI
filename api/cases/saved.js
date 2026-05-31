import { getDb } from "../_db.js";
import { setCors } from "../_cors.js";
import { ensureAuth } from "../_auth.js";
import { ensureCaseIndexes } from "../_cases.js";
import { methodNotAllowed, parsePagination, sendJson } from "../_http.js";

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "OPTIONS"]);

  const user = await ensureAuth(req, res);
  if (!user) return;

  try {
    const db = await getDb();
    await ensureCaseIndexes(db);
    const { limit, page, skip } = parsePagination(req);
    const docs = await db
      .collection("saved_cases")
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return sendJson(res, 200, {
      page,
      limit,
      savedCases: docs.map((doc) => ({
        caseRef: doc.caseRef,
        createdAt: doc.createdAt,
      })),
    });
  } catch (err) {
    console.error("saved_cases_error", err?.message);
    return sendJson(res, 500, { error: "server_error" });
  }
}
