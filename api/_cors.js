// api/_cors.js
export function setCors(req, res) {
  const origin = req.headers.origin || "";
  
  // allow apex and any subdomain of tenantact.org (with optional port)
  const isAllowedOrigin = 
    origin === "https://tenantact.org" || 
    origin.endsWith(".tenantact.org") || 
    /^https?:\/\/([a-z0-9-]+\.)*tenantact\.org(?::\d+)?$/i.test(origin);

  res.setHeader("X-Debug-CORS-Origin", origin || "empty");

  if (process.env?.DISABLE_CORS === 'true') {
    res.setHeader("Access-Control-Allow-Origin", '*');
    res.setHeader("X-Debug-CORS-Match", "all (disabled)");
  } else if (isAllowedOrigin || origin.includes("tenantact.org")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("X-Debug-CORS-Match", "true");
  } else {
    res.setHeader("X-Debug-CORS-Match", "false");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-2f-Code, x-2f-code");
  res.setHeader("Access-Control-Expose-Headers", "X-Debug-2FA, X-Debug-CORS-Match");
  res.setHeader("Access-Control-Max-Age", "86400");
}
