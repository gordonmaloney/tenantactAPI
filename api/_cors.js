// api/_cors.js
export function setCors(req, res) {
  const origin = req.headers.origin || "";
  // allow apex and any subdomain of tenantact.org (with optional port)
  const allowed = /^https?:\/\/([a-z0-9-]+\.)*tenantact\.org(?::\d+)?$/i

  if (process.env?.DISABLE_CORS === 'true') {
    res.setHeader("Access-Control-Allow-Origin", '*');
  } else if (allowed.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin"); // important for caching
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // If you will send cookies, also set:
  // res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight
}
