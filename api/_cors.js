export function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = /\.tenantact\.org$/; // matches any subdomain, e.g. foo.tenantact.org

  if (allowed.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin"); // ensures correct caching
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}
