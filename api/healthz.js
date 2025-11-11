// api/healthz.js
import { getDb } from "./_db.js";

export default async function handler(_req, res) {
  try {
    const db = await getDb();
    // Ping the DB
    await db.command({ ping: 1 });

    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        db: "ok",
        now: new Date().toISOString(),
        uptime: process.uptime(),
      })
    );
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, db: "error" }));
  }
}
