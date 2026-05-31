export async function getJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return req.body ? JSON.parse(req.body) : {};
    } catch {
      throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 });
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 });
  }
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  return res.end(JSON.stringify(payload));
}

export function methodNotAllowed(res, methods) {
  res.statusCode = 405;
  res.setHeader("Allow", methods.join(", "));
  return res.end("Method Not Allowed");
}

export function getParam(req, name) {
  const value = req.query?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parsePagination(req) {
  const limit = Math.min(Math.max(Number(req.query?.limit) || 20, 1), 100);
  const page = Math.max(Number(req.query?.page) || 1, 1);
  return { limit, page, skip: (page - 1) * limit };
}
