import { getDb } from "../../../_db.js";
import { setCors } from "../../../_cors.js";
import { ensureAuth } from "../../../_auth.js";
import { ensureCaseIndexes, isValidCaseRef, normalizeCaseRef, serializeComment, validateCommentContent } from "../../../_cases.js";
import { getJsonBody, getParam, methodNotAllowed, parsePagination, sendJson } from "../../../_http.js";

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (!["GET", "POST"].includes(req.method)) {
    return methodNotAllowed(res, ["GET", "POST", "OPTIONS"]);
  }

  const caseRef = normalizeCaseRef(getParam(req, "caseRef"));
  if (!isValidCaseRef(caseRef)) return sendJson(res, 400, { error: "invalid_case_ref" });

  try {
    const db = await getDb();
    await ensureCaseIndexes(db);

    if (req.method === "GET") {
      const { limit, page, skip } = parsePagination(req);
      const comments = await db
        .collection("case_comments")
        .find({ caseRef })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      return sendJson(res, 200, {
        page,
        limit,
        comments: comments.map(serializeComment),
      });
    }

    const user = await ensureAuth(req, res);
    if (!user) return;
    const body = await getJsonBody(req);
    const content = validateCommentContent(body.content);
    if (!content) return sendJson(res, 400, { error: "invalid_content" });

    const now = new Date();
    const doc = {
      userId: user._id,
      caseRef,
      content,
      authorEmail: user.email,
      authorName: user.name || "",
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("case_comments").insertOne(doc);
    return sendJson(res, 201, { comment: serializeComment({ ...doc, _id: result.insertedId }) });
  } catch (err) {
    console.error("case_comments_error", err?.message);
    const status = err?.statusCode || 500;
    return sendJson(res, status, { error: status === 400 ? "invalid_json" : "server_error" });
  }
}
