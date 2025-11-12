// api/track.js
import crypto from "crypto";
import { getDb } from "./_db.js";
import { setCors } from "./_cors.js";

function getClientIp(req) {
  // Vercel passes through X-Forwarded-For; take the first IP
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function hashIp(ip) {
  // Daily salt for unlinkability; add your own secret for extra safety
  const salt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const secret = process.env.IP_HASH_SECRET || "";
  return crypto
    .createHash("sha256")
    .update(ip + secret + salt)
    .digest("hex");
}

export default async function handler(req, res) {
  // CORS first
  setCors(req, res);

  res.setHeader("X-Debug-Method", req.method || "N/A");
  res.setHeader("X-Debug-Origin", req.headers.origin || "N/A");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end("Method Not Allowed");
  }

  try {
    let body = req.body;

    // ✅ If middleware gave us a string (e.g. text/plain beacon), parse it
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    if (!body || typeof body !== "object") {
      // fallback for when body isn't pre-parsed
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }
    }

    // Minimal validation
    const type = String(body.type || "").trim(); // e.g. "page_view" | "action"
    const site = String(body.site || "").trim(); // e.g. "shout" | "tribunal"
    const path = String(body.path || "").trim(); // e.g. "/act/12345"
    const campaignId = body.campaignId ? String(body.campaignId) : undefined;
    if (!site || !path) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({ error: "missing_fields", need: ["site", "path"] })
      );
    }

    const db = await getDb();

    // Create indexes once per cold start (safe to call repeatedly)
    await db
      .collection("events")
      .createIndexes([
        { key: { ts: -1 } },
        { key: { site: 1, type: 1, campaignId: 1 } },
      ]);

    const ip = getClientIp(req);
    const doc = {
      type,
      site,
      path,
      campaignId,
      ts: new Date(),
      ref: req.headers.referer || req.headers.referrer || undefined,
      userAgent: req.headers["user-agent"],
      ipHash: ip ? hashIp(ip) : undefined,
    };

    await db.collection("events").insertOne(doc);
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error("track_error", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: "server_error" }));
  }
}

/*
EXAMPLE CALL:

import { useEffect } from "react";

export function useTracker({ type, campaignId }) {
  useEffect(() => {
    const path = window.location.pathname;
    const site = window.location.host

    const body = { type, site, path, campaignId };

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, [type, campaignId]);
}

useTracker({
type: "page_view" || "action",
campaignId: "test"})
*/
