// api/submission.js

import crypto from "crypto";
import { getDb } from "./_db.js";


function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function hashIp(ip) {
  const salt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const secret = process.env.IP_HASH_SECRET || "";
  return crypto.createHash("sha256").update(ip + secret + salt).digest("hex");
}


const ENC_KEY_B64 = process.env.PIIFIELD_KEY || ""; // must be 32 bytes (base64)
const HMAC_KEY_B64 = process.env.PII_HMAC_KEY || "";

function requireKey(buf, name) {
  if (!buf || buf.length !== 32) {
    throw new Error(`${name} must be a base64-encoded 32-byte key`);
  }
  return buf;
}

const ENC_KEY = requireKey(Buffer.from(ENC_KEY_B64, "base64"), "PIIFIELD_KEY");
const HMAC_KEY = requireKey(Buffer.from(HMAC_KEY_B64, "base64"), "PII_HMAC_KEY");

function encryptField(plaintext) {
  if (plaintext == null) return undefined;
  const iv = crypto.randomBytes(12); // GCM recommended 96-bit IV
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
}

// For exact-match lookups without revealing the value (e.g., find by email)
function hmacId(value) {
  if (value == null) return undefined;
  return crypto
    .createHmac("sha256", HMAC_KEY)
    .update(String(value).trim().toLowerCase())
    .digest("hex");
}

/**
 * Encrypts all **string** values in a (shallow) object.
 * Keeps non-strings as-is (numbers/booleans/arrays/objects).
 * If you want deep encryption, recurse into nested objects as well.
 */
function encryptObjectStringsShallow(obj) {
  if (!obj || typeof obj !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = encryptField(v);
    else out[k] = v; // keep arrays/objects as-is (or choose to recurse)
  }
  return out;
}

/* ------------------------------ Handler -------------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end("Method Not Allowed");
  }

  try {
    // Parse JSON body (works both with/without body parser)
    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    }

    // Minimal validation
    const type = String(body.type || "submission").trim();
    const site = String(body.site || "").trim();
    const path = String(body.path || "").trim();
    const testimonial = body.testimonial ?? undefined; // allow any shape
    const campaignId = body.campaignId ? String(body.campaignId) : undefined;

    // Accept arbitrary contactDeets object, encrypt strings, keep others
    const contactDeetsRaw =
      body.contactDeets && typeof body.contactDeets === "object"
        ? body.contactDeets
        : undefined;

    // Build lookup hashes for common keys (optional but very useful)
    const email_hash =
      contactDeetsRaw && contactDeetsRaw.email ? hmacId(contactDeetsRaw.email) : undefined;
    const phone_hash =
      contactDeetsRaw && (contactDeetsRaw.number || contactDeetsRaw.phone)
        ? hmacId(contactDeetsRaw.number ?? contactDeetsRaw.phone)
        : undefined;

    // Encrypt string fields (shallow) for at-rest protection
    const contactDeets =
      contactDeetsRaw ? encryptObjectStringsShallow(contactDeetsRaw) : undefined;

    if (!site || !path) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ error: "missing_fields", need: ["site", "path"] }));
    }

    const db = await getDb();

    // Indexes: ts for sort; typical filters for analytics; hashes for lookup
    await db.collection("events").createIndexes([
      { key: { ts: -1 } },
      { key: { site: 1, type: 1, campaignId: 1 } },
      { key: { email_hash: 1 } },
      { key: { phone_hash: 1 } },
    ]);

    const ip = getClientIp(req);
    const doc = {
      type,
      site,
      path,
      campaignId,
      testimonial,           // do NOT stringify; keep as-is
      contactDeets,          // encrypted strings inside
      email_hash,            // deterministic hash for lookups
      phone_hash,            // deterministic hash for lookups
      ts: new Date(),
      ref: req.headers.referer || req.headers.referrer || undefined,
      userAgent: req.headers["user-agent"],
      ipHash: ip ? hashIp(ip) : undefined,
    };

    await db.collection("events").insertOne(doc);

    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    // Avoid leaking body/PII in logs
    console.error("submission_error", { msg: err?.message, stack: err?.stack });
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: "server_error" }));
  }
}


/*
EXAMPLE CALL:

import { useEffect } from "react";

export function useSubmitter({ campaignId, contactDeets, testimonial }) {
  useEffect(() => {
    // guard against SSR just in case
    if (typeof window === "undefined") return;

    const type = "submission";
    const path = window.location.pathname;
    const site = window.location.host;

    const body = { type, site, path, campaignId, testimonial, contactDeets };

    (async () => {
      try {
        await fetch("/api/submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // swallow errors (as you had)
      }
    })();
    // re-send if any input changes
  }, [campaignId, testimonial, contactDeets]);
}


useTracker({
campaignId: "test",
contactDeets: {"name": "john doe", "email": "x@y.com", "number": "123"},
testimonial: ["a", "b"]
})
*/

/*
EXAMPLE CURL
curl -X POST "http://localhost:3000/api/submission" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "submission",
    "site": "portal",
    "path": "/act/12345",
    "contactDeets": {"name": "john doe", "email": "x@y.com", "number": "123"},
    "campaignId": "test",
    "testimonial": "great experience"
  }'
*/
