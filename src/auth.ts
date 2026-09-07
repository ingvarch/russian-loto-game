// Two independent gates.
//
// The owner cookie authorises writes to one session: it is minted at
// session creation and scoped to that session's path.
//
// HTTP Basic against ADMIN_PASSWORD authorises the admin panel, which
// sees every session. Basic is deliberate -- the 401 challenge makes the
// browser render its own password prompt, so no login form is needed.

const OWNER_COOKIE = "owner_token";

export function readOwnerToken(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName === undefined) continue;
    if (rawName.trim() !== OWNER_COOKIE) continue;
    return rest.join("=").trim();
  }
  return null;
}

// The username half is ignored; only the password is compared. An unset
// ADMIN_PASSWORD fails closed -- a missing secret must lock the panel,
// never open it.
export function checkBasicAuth(
  authHeader: string | null,
  expectedPassword: string | undefined,
): boolean {
  if (!expectedPassword) return false;
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authHeader.slice("Basic ".length));
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  return constantTimeEquals(decoded.slice(sep + 1), expectedPassword);
}

export function basicAuthChallenge(): Response {
  return new Response("authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="admin"' },
  });
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
