import assert from "node:assert/strict";
import { test } from "node:test";

import { decryptString, deriveEncryptionKey, encryptString } from "../lib/crypto";

test("round-trips unicode with a passphrase key", () => {
  const key = deriveEncryptionKey("a long owner lock secret");
  const payload = encryptString("invoice café 領収書", key);
  assert.equal(decryptString(payload, key), "invoice café 領収書");
  assert.notEqual(encryptString("invoice café 領収書", key), payload);
});

test("accepts a 32-byte hex key and a 32-byte base64 key", () => {
  const raw = Buffer.alloc(32, 7);
  const hexKey = deriveEncryptionKey(raw.toString("hex"));
  const b64Key = deriveEncryptionKey(raw.toString("base64"));
  assert.equal(hexKey.equals(raw), true);
  assert.equal(b64Key.equals(raw), true);
  assert.equal(decryptString(encryptString("token", hexKey), b64Key), "token");
});

test("rejects a short key and a mismatched key", () => {
  assert.throws(() => deriveEncryptionKey("too-short"), /16 characters/);
  const key = deriveEncryptionKey("correct horse battery");
  const other = deriveEncryptionKey("different horse battery");
  const payload = encryptString("refresh-token", key);
  assert.throws(() => decryptString(payload, other));
});

test("rejects tampered ciphertext and a tampered auth tag", () => {
  const key = deriveEncryptionKey("correct horse battery");
  const [version, iv, ciphertext, tag] = encryptString("refresh-token", key).split(":");
  const flippedCipher = Buffer.from(ciphertext, "base64url");
  flippedCipher[0] ^= 0xff;
  assert.throws(() => decryptString([version, iv, flippedCipher.toString("base64url"), tag].join(":"), key));

  const flippedTag = Buffer.from(tag, "base64url");
  flippedTag[0] ^= 0xff;
  assert.throws(() => decryptString([version, iv, ciphertext, flippedTag.toString("base64url")].join(":"), key));
  assert.throws(() => decryptString("not-a-token", key));
});
