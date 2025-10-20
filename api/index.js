// index.js
import express from "express";

const app = express();
app.set("trust proxy", true);

// Basic routes
app.get("/api", (_req, res) => {
  res.type("text/plain").send("OK");
});

app.get("/api/healthz", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    now: new Date().toISOString(),
  });
});

// Start locally (Vercel will ignore this and use default export)
if (process.env.VERCEL === undefined) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ API running at http://localhost:${PORT}/api`);
  });
}

export default app;
