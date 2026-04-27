// Session ID + owner token generation.
//
// Session IDs are 10 characters of Crockford-style base32 (no I, L, O, U)
// for ~50 bits of entropy: short enough to share verbally, long enough
// that random guessing isn't feasible against any realistic deployment.
//
// Owner tokens are 32 hex chars (128 bits). They live in an HttpOnly
// cookie scoped to the session path; the host needs them for writes,
// nobody else does.

const SESSION_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SESSION_ID_LENGTH = 10;
const OWNER_TOKEN_BYTES = 16;

export function newSessionId(): string {
  const bytes = new Uint8Array(SESSION_ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < SESSION_ID_LENGTH; i++) {
    // bytes[i] is non-undefined: we just allocated `bytes` with that length
    // above. Non-null assertion satisfies noUncheckedIndexedAccess.
    out += SESSION_ID_ALPHABET[bytes[i]! % SESSION_ID_ALPHABET.length];
  }
  return out;
}

export function newOwnerToken(): string {
  const bytes = new Uint8Array(OWNER_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
