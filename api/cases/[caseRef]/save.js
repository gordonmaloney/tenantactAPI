import { getDb } from "../../_db.js";
import { setCors } from "../../_cors.js";
import { ensureAuth } from "../../_auth.js";
import { ensureCaseIndexes, isValidCaseRef, normalizeCaseRef } from "../../_cases.js";
import { getParam, methodNotAllowed, sendJson } from "../../_http.js";

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (!["POST", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["POST", "DELETE", "OPTIONS"]);
  }

  const user = await ensureAuth(req, res);
  if (!user) return;

  const caseRef = normalizeCaseRef(getParam(req, "caseRef"));
  if (!isValidCaseRef(caseRef)) return sendJson(res, 400, { error: "invalid_case_ref" });

  try {
    const db = await getDb();
    await ensureCaseIndexes(db);

    if (req.method === "POST") {
      await db.collection("saved_cases").updateOne(
        { userId: user._id, caseRef },
        { $setOnInsert: { userId: user._id, caseRef, createdAt: new Date() } },
        { upsert: true },
      );
      return sendJson(res, 200, { caseRef, saved: true });
    }

    await db.collection("saved_cases").deleteOne({ userId: user._id, caseRef });
    return sendJson(res, 200, { caseRef, saved: false });
  } catch (err) {
    console.error("case_save_error", err?.message);
    return sendJson(res, 500, { error: "server_error" });
  }
}
