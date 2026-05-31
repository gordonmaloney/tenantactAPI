import { getDb } from "./_db.js";
import { handleCors } from "./_cors.js";
import { ensureAuth } from "./_auth.js";
import {
  ensureCaseIndexes,
  isValidCaseRef,
  normalizeCaseRef,
  objectIdFromParam,
  serializeComment,
  validateCommentContent,
} from "./_cases.js";
import { getJsonBody, methodNotAllowed, parsePagination, sendJson } from "./_http.js";

function routeParts(req) {
  const path = req.query?.path;
  const raw = Array.isArray(path) ? path.join("/") : String(path || "");
  return raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function caseRefFromParts(parts) {
  return normalizeCaseRef(parts.join("/"));
}

async function listSavedCases(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "OPTIONS"]);

  const user = await ensureAuth(req, res);
  if (!user) return;

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
}

async function saveCase(req, res, parts) {
  if (!["POST", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["POST", "DELETE", "OPTIONS"]);
  }

  const user = await ensureAuth(req, res);
  if (!user) return;

  const caseRef = caseRefFromParts(parts.slice(0, -1));
  if (!isValidCaseRef(caseRef)) return sendJson(res, 400, { error: "invalid_case_ref" });

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
}

async function listOrCreateComments(req, res, parts, commentsIndex) {
  if (!["GET", "POST"].includes(req.method)) {
    return methodNotAllowed(res, ["GET", "POST", "OPTIONS"]);
  }

  const user = await ensureAuth(req, res);
  if (!user) return;

  const caseRef = caseRefFromParts(parts.slice(0, commentsIndex));
  if (!isValidCaseRef(caseRef)) return sendJson(res, 400, { error: "invalid_case_ref" });

  const db = await getDb();
  await ensureCaseIndexes(db);

  if (req.method === "GET") {
    const { limit, page, skip } = parsePagination(req);
    const comments = await db
      .collection("case_comments")
      .find({ caseRef, userId: user._id })
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
}

async function mutateComment(req, res, parts, commentsIndex) {
  if (!["PATCH", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["PATCH", "DELETE", "OPTIONS"]);
  }

  const user = await ensureAuth(req, res);
  if (!user) return;

  const caseRef = caseRefFromParts(parts.slice(0, commentsIndex));
  const commentId = objectIdFromParam(parts[commentsIndex + 1]);
  if (!isValidCaseRef(caseRef)) return sendJson(res, 400, { error: "invalid_case_ref" });
  if (!commentId) return sendJson(res, 400, { error: "invalid_comment_id" });

  const db = await getDb();
  await ensureCaseIndexes(db);
  const comments = db.collection("case_comments");
  const existing = await comments.findOne({ _id: commentId, caseRef, userId: user._id });

  if (!existing) return sendJson(res, 404, { error: "comment_not_found" });

  if (req.method === "DELETE") {
    await comments.deleteOne({ _id: commentId, caseRef, userId: user._id });
    return sendJson(res, 200, { deleted: true });
  }

  const body = await getJsonBody(req);
  const content = validateCommentContent(body.content);
  if (!content) return sendJson(res, 400, { error: "invalid_content" });

  const updatedAt = new Date();
  await comments.updateOne({ _id: commentId, caseRef, userId: user._id }, { $set: { content, updatedAt } });
  return sendJson(res, 200, { comment: serializeComment({ ...existing, content, updatedAt }) });
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const parts = routeParts(req);
    if (parts.length === 1 && parts[0] === "saved") return listSavedCases(req, res);
    if (parts.length >= 2 && parts.at(-1) === "save") return saveCase(req, res, parts);

    const commentsIndex = parts.lastIndexOf("comments");
    if (commentsIndex > 0 && commentsIndex === parts.length - 1) {
      return listOrCreateComments(req, res, parts, commentsIndex);
    }
    if (commentsIndex > 0 && commentsIndex === parts.length - 2) {
      return mutateComment(req, res, parts, commentsIndex);
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    console.error("cases_route_error", err?.message);
    const status = err?.statusCode || 500;
    return sendJson(res, status, { error: status === 400 ? "invalid_json" : "server_error" });
  }
}
