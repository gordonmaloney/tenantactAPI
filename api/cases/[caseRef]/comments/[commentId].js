import { getDb } from "../../../_db.js";
import { setCors } from "../../../_cors.js";
import { ensureAuth } from "../../../_auth.js";
import { ensureCaseIndexes, isValidCaseRef, normalizeCaseRef, objectIdFromParam, serializeComment, validateCommentContent } from "../../../_cases.js";
import { getJsonBody, getParam, methodNotAllowed, sendJson } from "../../../_http.js";

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (!["PATCH", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["PATCH", "DELETE", "OPTIONS"]);
  }

  const user = await ensureAuth(req, res);
  if (!user) return;

  const caseRef = normalizeCaseRef(getParam(req, "caseRef"));
  const commentId = objectIdFromParam(getParam(req, "commentId"));
  if (!isValidCaseRef(caseRef)) return sendJson(res, 400, { error: "invalid_case_ref" });
  if (!commentId) return sendJson(res, 400, { error: "invalid_comment_id" });

  try {
    const db = await getDb();
    await ensureCaseIndexes(db);
    const comments = db.collection("case_comments");
    const existing = await comments.findOne({ _id: commentId, caseRef });

    if (!existing) return sendJson(res, 404, { error: "comment_not_found" });
    if (String(existing.userId) !== String(user._id) && user.role !== "admin") {
      return sendJson(res, 403, { error: "forbidden" });
    }

    if (req.method === "DELETE") {
      await comments.deleteOne({ _id: commentId, caseRef });
      return sendJson(res, 200, { deleted: true });
    }

    const body = await getJsonBody(req);
    const content = validateCommentContent(body.content);
    if (!content) return sendJson(res, 400, { error: "invalid_content" });

    const updatedAt = new Date();
    await comments.updateOne({ _id: commentId, caseRef }, { $set: { content, updatedAt } });
    const updated = { ...existing, content, updatedAt };
    return sendJson(res, 200, { comment: serializeComment(updated) });
  } catch (err) {
    console.error("case_comment_mutation_error", err?.message);
    const status = err?.statusCode || 500;
    return sendJson(res, status, { error: status === 400 ? "invalid_json" : "server_error" });
  }
}
