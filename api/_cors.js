export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const { protocol, hostname, port } = parsed;

  if (protocol === "https:") {
    return hostname === "tenantact.org" || hostname.endsWith(".tenantact.org");
  }

  if (protocol === "http:" && hostname === "localhost") {
    return port === "3000" || port === "5173";
  }

  return false;
}

export function setCors(req, res, options = {}) {
  const origin = req.headers.origin;
  const allowCredentials = options.allowCredentials === true;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (allowCredentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-2F-Code"
  );
}

export function handleCors(req, res, options = {}) {
  setCors(req, res, options);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
