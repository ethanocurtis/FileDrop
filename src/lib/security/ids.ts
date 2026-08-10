import { randomBytes, randomUUID } from "node:crypto";

// Unambiguous URL-safe alphabet (no 0/O/1/l/I) so share IDs are easy to
// read aloud and hard to mistype.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Cryptographically secure, unguessable share ID for public URLs
 * (/f/{shareId}). 22 characters from a 58-symbol alphabet is ~128 bits of
 * entropy, comparable to a UUIDv4, while staying short and shareable.
 */
export function generateShareId(length = 22): string {
  const bytes = randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

/** Internal-only random key component for object storage paths. */
export function generateStorageId(): string {
  return randomUUID();
}
