/**
 * scripts/migrate_testimonials.js
 * 
 * Migrates existing unencrypted testimonials to the new encrypted format.
 * Usage:
 *   node scripts/migrate_testimonials.js [--dry-run] [--test-one]
 */

import crypto from "crypto";
import { MongoClient } from "mongodb";

// --- Configuration ---
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DBNAME || "tenantact";
const ENC_KEY_B64 = process.env.PIIFIELD_KEY || "";

if (!uri) {
  console.error("❌ MONGODB_URI is required");
  process.exit(1);
}
if (!ENC_KEY_B64) {
  console.error("❌ PIIFIELD_KEY is required");
  process.exit(1);
}

const ENC_KEY = Buffer.from(ENC_KEY_B64, "base64");
if (ENC_KEY.length !== 32) {
  console.error("❌ PIIFIELD_KEY must be a 32-byte base64 string");
  process.exit(1);
}

// --- Encryption Helpers (duplicated from submission.js for standalone use) ---

function encryptField(plaintext) {
  if (plaintext == null) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
}

function encryptObjectStringsShallow(obj) {
  if (!obj || typeof obj !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = encryptField(v);
    else out[k] = v;
  }
  return out;
}

function isEncrypted(val) {
  return val && typeof val === "object" && val.ct && val.iv && val.tag;
}

// --- Main Migration Logic ---

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const testOne = process.argv.includes("--test-one");

  console.log(`🚀 Starting migration... ${dryRun ? "[DRY RUN]" : ""} ${testOne ? "[TEST ONE]" : ""}`);

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("events");

    // Find documents with a testimonial that isn't already encrypted
    // We filter for testimonial exists and isn't null
    const cursor = collection.find({ testimonial: { $exists: true, $ne: null } });

    let count = 0;
    let modified = 0;

    for await (const doc of cursor) {
      count++;
      const current = doc.testimonial;

      // Skip already encrypted single-field testimonials
      if (isEncrypted(current)) {
        continue;
      }

      // Check for encrypted objects (shallow)
      // If it's an object and none of its values are unencrypted strings, we might skip it.
      // But more safely: if it's an object and has NO 'ct' property, it needs processing.
      
      let needsEncryption = false;
      let nuevoTestimonial = null;

      if (typeof current === "string") {
        needsEncryption = true;
        nuevoTestimonial = encryptField(current);
      } else if (typeof current === "object" && current !== null) {
        // It's a structured testimonial. Check if any values need encryption.
        const unencryptedStrings = Object.values(current).some(v => typeof v === "string");
        if (unencryptedStrings) {
          needsEncryption = true;
          nuevoTestimonial = encryptObjectStringsShallow(current);
        }
      }

      if (needsEncryption) {
        modified++;
        if (dryRun) {
          console.log(`[DRY RUN] Would update doc ${doc._id}`);
          console.log(`  From: ${JSON.stringify(current).substring(0, 100)}...`);
          console.log(`  To:   ${JSON.stringify(nuevoTestimonial).substring(0, 100)}...`);
        } else {
          await collection.updateOne(
            { _id: doc._id },
            { $set: { testimonial: nuevoTestimonial } }
          );
          console.log(`✅ Updated doc ${doc._id}`);
        }

        if (testOne) {
          console.log("🛑 Stopping after one record due to --test-one");
          break;
        }
      }
    }

    console.log("\n--- Summary ---");
    console.log(`Total testimonials scanned: ${count}`);
    console.log(`${dryRun ? "Would have updated" : "Successfully updated"}: ${modified}`);
    
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.close();
  }
}

run();
