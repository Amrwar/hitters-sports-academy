import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));

// scrypt parameters (OWASP: N=2^15, r=8, p=1 or stronger). Stored with the hash so they can be raised later.
const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

/** Returns "scrypt$N$r$p$salt$hash" (base64url parts). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  const nN = Number(n);
  const key = await scrypt(password.normalize("NFKC"), salt, expected.length, { N: nN, r: Number(r), p: Number(p), maxmem: 128 * nN * Number(r) * 2 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** True when the stored hash uses weaker parameters than the current defaults and should be re-hashed on next login. */
export function needsRehash(stored: string): boolean {
  const [, n, r, p] = stored.split("$");
  return Number(n) < N || Number(r) < R || Number(p) < P;
}
