import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { isPrivateAddress } from "../lib/oauth/cimd";
import { verifyPkceS256 } from "../lib/oauth/pkce";
import { isAllowedRedirectUri } from "../lib/oauth/redirect";
import { parseRegistration } from "../lib/oauth/registration";
import { readFileSync } from "node:fs";

import { SCHEMA_SQL, schemaStatements } from "../lib/schema";

test("PKCE S256 accepts the matching verifier only", () => {
  const verifier = "a".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(`${verifier}b`.slice(0, 50), challenge), false);
  assert.equal(verifyPkceS256("short", challenge), false);
  assert.equal(verifyPkceS256(`${verifier.slice(0, 42)} `, challenge), false);
});

test("redirect URIs allow https, localhost, and native app schemes", () => {
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8787/callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:3000/callback"), true);
  assert.equal(isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"), true);
  assert.equal(isAllowedRedirectUri("http://evil.example/callback"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai/callback#frag"), false);
});

test("registration rejects open redirects and implicit grants", () => {
  const parsed = parseRegistration({
    client_name: "Cursor",
    redirect_uris: ["cursor://anysphere.cursor-mcp/oauth/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
  });
  assert.equal(parsed.clientName, "Cursor");
  assert.throws(
    () => parseRegistration({ redirect_uris: ["http://evil.example/callback"] }),
    /not allowed/,
  );
  assert.throws(
    () =>
      parseRegistration({
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["implicit"],
      }),
    /authorization_code/,
  );
});

test("private addresses are blocked and public ones are not", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.9", "169.254.1.1", "::1", "fd00::1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2001:4860:4860::8888"), false);
});

test("the checked-in migration matches the schema the app applies", () => {
  const file = readFileSync(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8");
  assert.equal(file.trim(), SCHEMA_SQL.trim());
  assert.ok(schemaStatements().length >= 6);
});
