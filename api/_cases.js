import { ObjectId } from "mongodb";

export function normalizeCaseRef(value) {
  return decodeURIComponent(String(value || "")).trim();
}

export function isValidCaseRef(caseRef) {
  return (
    typeof caseRef === "string" &&
    caseRef.length >= 3 &&
    caseRef.length <= 160 &&
    /^[A-Za-z0-9][A-Za-z0-9/_:().,\-\s]*$/.test(caseRef)
  );
}

export function validateCommentContent(content) {
  const trimmed = String(content || "").trim();
  if (trimmed.length < 1 || trimmed.length > 5000) return null;
  return trimmed;
}

export function serializeComment(comment) {
  return {
    id: String(comment._id),
    caseRef: comment.caseRef,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: {
      id: String(comment.userId),
      email: comment.authorEmail,
      name: comment.authorName || "",
    },
  };
}

export async function ensureCaseIndexes(db) {
  await db.collection("saved_cases").createIndexes([
    { key: { userId: 1, caseRef: 1 }, unique: true },
    { key: { userId: 1, createdAt: -1 } },
    { key: { caseRef: 1 } },
  ]);
  await db.collection("case_comments").createIndexes([
    { key: { caseRef: 1, createdAt: -1 } },
    { key: { userId: 1, createdAt: -1 } },
    { key: { caseRef: 1, userId: 1 } },
  ]);
}

export function objectIdFromParam(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}
