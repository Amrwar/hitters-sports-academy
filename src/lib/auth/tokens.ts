import { createHash, randomBytes } from "node:crypto";

/** Opaque random token for sessions and one-time links. Only its SHA-256 is stored. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
