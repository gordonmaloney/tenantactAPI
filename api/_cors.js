// api/_cors.js
export function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (origin) console.log("CORS Origin:", origin);
  
  // allow apex and any subdomain of tenantact.org (with optional port)
  const isAllowedOrigin = 
    origin === "https://tenantact.org" || 
    origin.endsWith(".tenantact.org") || 
    /^https?:\/\/([a-z0-9-]+\.)*tenantact\.org(?::\d+)?$/i.test(origin);

  if (process.env?.DISABLE_CORS === 'true') {
    res.setHeader("Access-Control-Allow-Origin", '*');
  } else if (isAllowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin.includes("tenantact")) {
    // Extra safety for anything containing tenantact
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin"); // important for caching
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-2f-Code");
  res.setHeader("Access-Control-Expose-Headers", "X-Debug-2FA");
  // If you will send cookies, also set:
  // res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight
}
