import express from "express";

const app = express();

app.set("trust proxy", true);

app.get("/", (_req, res) => {
  res.type("text/plain").send("OK");
});

app.get("/v1/healthz", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    now: new Date().toISOString(),
  });
});

// --- only start server if run directly (not by Vercel) ---
if (process.env.VERCEL === undefined) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ API running locally on http://localhost:${PORT}`);
  });
}

export default app;
