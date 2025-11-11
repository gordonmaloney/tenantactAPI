// api/fetch.js
import { getDb } from "./_db.js";
import crypto from "crypto";

/* ----------------- setup ----------------- */

const PASSWORD = process.env.PASSWORD;
const ENC_KEY = Buffer.from(process.env.PIIFIELD_KEY, "base64");
if (ENC_KEY.length !== 32) {
  throw new Error("PIIFIELD_KEY must be a base64-encoded 32-byte key");
}

/* ----------------- helpers ----------------- */

// decrypt a single field
function decryptField(enc) {
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

// decrypt shallow contactDeets
function decryptContactDeets(obj = {}) {
  if (!obj || typeof obj !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = decryptField(v);
  }
  return out;
}

// optional masking helpers
function maskEmail(email) {
  if (!email) return undefined;
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const maskedUser =
    user.length <= 2
      ? "••"
      : user[0] + "•".repeat(user.length - 2) + user[user.length - 1];
  return `${maskedUser}@${domain[0]}•••`;
}
function maskNumber(num) {
  if (!num) return undefined;
  const digits = String(num).replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  return "••••" + digits.slice(-4);
}

/* ----------------- handler ----------------- */

export default async function handler(req, res) {
  // 🔒 password auth
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

    // decrypt + mask
    const decrypted = events.map((e) => {
      const cd = e.contactDeets
        ? decryptContactDeets(e.contactDeets)
        : undefined;
      const masked = cd
        ? {
            ...cd,
            email: maskEmail(cd.email),
            number: maskNumber(cd.number ?? cd.phone),
          }
        : undefined;
      return {
        ...e,
        contactDeets: cd, // masked decrypted info
      };
    });

    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({ ok: true, count: decrypted.length, events: decrypted })
    );
  } catch (err) {
    console.error("fetch_error", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "server_error" }));
  }
}

//EXAMPLE HERE
/*
curl -X GET "http://localhost:3000/api/fetch?limit=10&site=portal" \
  -H "Authorization: Bearer supersecretpassword123" \
  -H "Accept: application/json"
*/
