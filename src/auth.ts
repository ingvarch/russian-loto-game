// Owner-cookie helpers.
//
// The cookie is a single name=value pair (`owner_token=<token>`) plus
// attributes set by the server. We never read attributes back; we only
// need to extract the token from incoming Cookie headers.

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
