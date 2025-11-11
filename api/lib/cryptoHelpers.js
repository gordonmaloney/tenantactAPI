// lib/cryptoHelpers.js
import crypto from "crypto";

const ENC_KEY = Buffer.from(process.env.PIIFIELD_KEY, "base64"); // 32 bytes
function requireKey(buf, name) {
  if (!buf || buf.length !== 32) throw new Error(`${name} invalid length`);
  return buf;
}
requireKey(ENC_KEY, "PIIFIELD_KEY");

export function decryptField(enc) {
  if (!enc) return undefined;
  const iv = Buffer.from(enc.iv, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const ct = Buffer.from(enc.ct, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Decrypt shallow object produced by encryptObjectStringsShallow */
export function decryptContactDeets(encObj = {}) {
  if (!encObj || typeof encObj !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(encObj)) {
    // strings were stored as {iv,tag,ct}, other types (arrays/objects/bools) were left as-is
    out[k] = v && typeof v === "object" && "ct" in v ? decryptField(v) : v;
  }
  return out;
}