import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Hash a drop password for storage. Never store or log the plaintext. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/** Constant-time-safe comparison via bcrypt's own compare implementation. */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}
