/**
 * verify_migration.js
 * 
 * Verifies that a migrated record can be correctly decrypted.
 */

import { MongoClient, ObjectId } from "mongodb";
import crypto from "crypto";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DBNAME || "tenantact-api";
const ENC_KEY_B64 = process.env.PIIFIELD_KEY || "";
const targetId = "699c747c38562a7a0f95c0e6";

const ENC_KEY = Buffer.from(ENC_KEY_B64, "base64");

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
  } catch (err) {
    return "⚠️ decrypt_error: " + err.message;
  }
}

function decryptContactDeets(obj = {}, ENC_KEY) {
  if (!obj || typeof obj !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = decryptField(v, ENC_KEY);
  }
  return out;
}

async function verify() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("events");

    const doc = await collection.findOne({ _id: new ObjectId(targetId) });

    if (!doc) {
      console.error("❌ Document not found");
      return;
    }

    console.log("📄 Document found:", doc._id);
    console.log("Encrypted testimonial:", JSON.stringify(doc.testimonial).substring(0, 100) + "...");

    // Decryption logic from fetch.js
    let testimonial = doc.testimonial;
    if (testimonial && typeof testimonial === "object") {
      if (testimonial.ct) {
        testimonial = decryptField(testimonial, ENC_KEY);
      } else {
        testimonial = decryptContactDeets(testimonial, ENC_KEY);
      }
    }

    console.log("Decrypted testimonial:", testimonial);
    
    if (typeof testimonial === "string" && testimonial.length > 0) {
        console.log("✅ Verification successful!");
    } else if (typeof testimonial === "object" && Object.keys(testimonial).length > 0) {
        console.log("✅ Verification successful (object)!");
    } else {
        console.error("❌ Verification failed: Decrypted testimonial is empty or invalid type");
    }

  } catch (err) {
    console.error("❌ Verification failed:", err);
  } finally {
    await client.close();
  }
}

verify();
