import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Accept a 32-byte key (64 hex chars, or standard base64 that decodes to 32 bytes)
 * or any other secret of at least 16 characters, which is hashed to 32 bytes.
 */
export function deriveEncryptionKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const asBase64 = decodeBase64Lenient(trimmed);
  if (
    asBase64 &&
    asBase64.length === 32 &&
    (trimmed.length === 43 || trimmed.length === 44)
  ) {
    return asBase64;
  }

  if (trimmed.length < 16) {
    throw new Error(
      "TOKEN_ENC_KEY must be at least 16 characters, or a 32-byte key encoded as hex or base64.",
    );
  }

  return createHash("sha256").update(trimmed, "utf8").digest();
}

function decodeBase64Lenient(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = Buffer.from(normalized + pad, "base64");
    const roundTrip = decoded.toString("base64").replace(/=+$/, "");
    const input = normalized.replace(/=+$/, "");
    if (roundTrip !== input) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function encryptString(plaintext: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_LENGTH) {
    throw new Error("Unexpected auth tag length.");
  }
  return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(
    ":",
  );
}

export function decryptString(payload: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Encrypted value is not in the expected format.");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const ciphertext = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Encrypted value is not in the expected format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqualString(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
