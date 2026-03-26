import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, key] = hashedPassword.split(":");
  if (!salt || !key) {
    return false;
  }

  const derivedBuffer = scryptSync(password, salt, KEY_LENGTH);
  const keyBuffer = Buffer.from(key, "hex");
  if (derivedBuffer.length !== keyBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedBuffer, keyBuffer);
}
