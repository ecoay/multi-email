import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMessage } from "../lib/gmail/parse";

test("parseMessage keeps the first text part and truncates huge bodies", () => {
  const huge = "a".repeat(90_000);
  const parsed = parseMessage({
    id: "m",
    payload: {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: Buffer.from(huge).toString("base64url") } },
        { mimeType: "text/html", body: { data: Buffer.from("<p>hi</p>").toString("base64url") } },
      ],
    },
  });
  assert.equal(parsed.text?.length, 80_000);
  assert.equal(parsed.textTruncated, true);
  assert.equal(parsed.html, "<p>hi</p>");
  assert.equal(parsed.htmlTruncated, undefined);
});
