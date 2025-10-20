// Responds to GET /api/healthz
export default function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end("Method Not Allowed");
  }
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      uptime: process.uptime(),
      now: new Date().toISOString(),
    })
  );
}
