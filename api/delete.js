// api/delete.js
import { getDb } from "./_db.js";
import { ObjectId } from "mongodb";

// simple bearer auth: set EVENTS_API_PASSWORD in your env
function checkAuth(req, res) {
  const pwd = process.env.PASSWORD || "";
  const auth = req.headers.authorization || "";
  if (!pwd || auth !== `Bearer ${pwd}`) {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", "Bearer");
    res.end("Unauthorized");
    return false;
  }
  return true;
}

async function getJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
}

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.statusCode = 405;
    res.setHeader("Allow", "DELETE");
    return res.end("Method Not Allowed");
  }

  if (!checkAuth(req, res)) return;

  try {
    const body = await getJsonBody(req);
    const id = (req.query.id || body.id || "").toString().trim();

    if (!id || !ObjectId.isValid(id)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "invalid_or_missing_id" }));
    }

    const db = await getDb();
    const result = await db
      .collection("events")
      .deleteOne({ _id: new ObjectId(id) });

    res.setHeader("content-type", "application/json");
    return res.end(
      JSON.stringify({ ok: true, deletedCount: result.deletedCount })
    );
  } catch (err) {
    console.error("delete_error", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: "server_error" }));
  }
}


/*
# DELETE by id (query)
curl -X DELETE "http://localhost:3000/api/delete?id=644f8a9b7d3a2f001234abcd" \
  -H "Authorization: Bearer supersecretpassword123"

# or DELETE with JSON body
curl -X DELETE "http://localhost:3000/api/delete" \
  -H "Authorization: Bearer supersecretpassword123" \
  -H "Content-Type: application/json" \
  -d '{"id":"644f8a9b7d3a2f001234abcd"}'

*/