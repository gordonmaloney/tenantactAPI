import { handleCors } from "./_cors.js";

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, OPTIONS");
    return res.end("Method Not Allowed");
  }
  res.end("OK");
}
