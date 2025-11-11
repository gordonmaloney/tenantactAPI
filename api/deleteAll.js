// api/deleteAll.js

/* DISABLED - FOR DEV ONLY
import { getDb } from "./_db.js";

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

    const site =
      (req.query.site || body.site || "").toString().trim() || undefined;
    const type =
      (req.query.type || body.type || "").toString().trim() || undefined;
    const campaignId =
      (req.query.campaignId || body.campaignId || "").toString().trim() ||
      undefined;
    const path =
      (req.query.path || body.path || "").toString().trim() || undefined;
    const beforeStr =
      (req.query.before || body.before || "").toString().trim() || undefined;
    const confirm = (req.query.confirm || body.confirm || "").toString().trim();

    const filter = {};
    if (site) filter.site = site;
    if (type) filter.type = type;
    if (campaignId) filter.campaignId = campaignId;
    if (path) filter.path = path;

    if (beforeStr) {
      const dt = new Date(beforeStr);
      if (Number.isNaN(dt.getTime())) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "invalid_before_date" }));
      }
      filter.ts = { $lt: dt };
    }

    const hasAnyFilter = Object.keys(filter).length > 0;

    if (!hasAnyFilter) {
      // Allow nuking everything only with explicit confirm
      if (confirm !== "ALL") {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({
            error: "missing_filters_or_confirmation",
            need: ["site|type|campaignId|path|before"],
            confirm: "ALL",
          })
        );
      }
    }

    const db = await getDb();
    const result = await db
      .collection("events")
      .deleteMany(hasAnyFilter ? filter : {});

    res.setHeader("content-type", "application/json");
    return res.end(
      JSON.stringify({
        ok: true,
        deletedCount: result.deletedCount,
        filter: hasAnyFilter ? filter : "ALL",
      })
    );
  } catch (err) {
    console.error("deleteAll_error", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: "server_error" }));
  }
}

/*
# Delete all events for a site
curl -X DELETE "http://localhost:3000/api/deleteAll?site=portal" \
  -H "Authorization: Bearer supersecretpassword123"

# Delete all submissions for a site before a date
curl -X DELETE "http://localhost:3000/api/deleteAll?site=portal&type=submission&before=2025-01-01T00:00:00.000Z" \
  -H "Authorization: Bearer supersecretpassword123"

# Delete everything (dangerous—requires explicit confirm)
curl -X DELETE "http://localhost:3000/api/deleteAll?confirm=ALL" \
  -H "Authorization: Bearer supersecretpassword123"

# Same with JSON body instead of query params
curl -X DELETE "http://localhost:3000/api/deleteAll" \
  -H "Authorization: Bearer supersecretpassword123" \
  -H "Content-Type: application/json" \
  -d '{"site":"portal","before":"2025-01-01T00:00:00.000Z"}'
*/