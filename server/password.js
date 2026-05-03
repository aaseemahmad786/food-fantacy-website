import crypto from "node:crypto";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;

  const candidate = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");

  return original.length === candidate.length && crypto.timingSafeEqual(original, candidate);
}
