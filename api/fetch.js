// api/fetch.js
import { getDb } from "./_db.js";
import crypto from "crypto";

const PASSWORD = process.env.PASSWORD;

// ---- helpers ----
function getEncKey() {
  const b64 = (process.env.PIIFIELD_KEY || "").trim();
  if (!b64) throw new Error("Missing PIIFIELD_KEY");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32)
    throw new Error("PIIFIELD_KEY must be base64 32 bytes");
  return key;
}

function decryptField(enc, ENC_KEY) {
  if (!enc || typeof enc !== "object" || !enc.ct) return enc;
  try {
    const iv = Buffer.from(enc.iv, "base64");
    const tag = Buffer.from(enc.tag, "base64");
    const ct = Buffer.from(enc.ct, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return "⚠️ decrypt_error";
  }
}

function decryptContactDeets(obj = {}, ENC_KEY) {
  if (!obj || typeof obj !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = decryptField(v, ENC_KEY);
  return out;
}

function maskEmail(email) {
  if (!email) return undefined;
  const [u, d] = String(email).split("@");
  if (!d) return email;
  const mu =
    u.length <= 2 ? "••" : u[0] + "•".repeat(u.length - 2) + u[u.length - 1];
  return `${mu}@${d[0]}•••`;
}

function maskNumber(num) {
  if (!num) return undefined;
  const digits = String(num).replace(/\D/g, "");
  return digits.length <= 4 ? "••••" : "••••" + digits.slice(-4);
}

// ---- handler ----
export default async function handler(req, res) {
  // auth
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${PASSWORD}`) {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.end("Unauthorized");
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end("Method Not Allowed");
  }

  // load key safely at request time
  let ENC_KEY;
  try {
    ENC_KEY = getEncKey();
  } catch (e) {
    console.error("fetch_key_error", e.message);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(
      JSON.stringify({ error: "server_misconfig", detail: e.message })
    );
  }

  try {
    const db = await getDb();
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const site = req.query.site || undefined;

    const filter = site ? { site } : {};
    const events = await db
      .collection("events")
      .find(filter)
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();

    const decrypted = events.map((e) => {
      const cd = e.contactDeets
        ? decryptContactDeets(e.contactDeets, ENC_KEY)
        : undefined;
      const masked = cd
        ? {
            ...cd,
            email: maskEmail(cd.email),
            number: maskNumber(cd.number ?? cd.phone),
          }
        : undefined;
      return { ...e, contactDeets: cd };
    });

    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({ ok: true, count: decrypted.length, events: decrypted })
    );
  } catch (err) {
    console.error("fetch_error", err?.message);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "server_error" }));
  }
}

//EXAMPLE HERE
/*
curl -X GET "https://tenantactapi.vercel.app/api/fetch?limit=10&site=portal" \
  -H "Authorization: Bearer supersecretpassword123" \
  -H "Accept: application/json"
*/
