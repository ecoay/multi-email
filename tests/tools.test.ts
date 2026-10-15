import assert from "node:assert/strict";
import { test } from "node:test";

import { McpServer } from "@modelcontextprotocol/server";

import { registerTools } from "../lib/mcp/register";

test("registers the read tools and hides drafts unless write is enabled", () => {
  delete process.env.GMAIL_ENABLE_WRITE;
  const server = new McpServer({ name: "multi-gmail", version: "1.0.0" });
  registerTools(server);
  const names = toolNames(server);
  for (const name of ["list_accounts", "search_threads", "get_message", "get_thread", "list_attachments", "get_attachment"]) {
    assert.ok(names.has(name), name);
  }
  assert.equal(names.has("create_draft"), false);

  process.env.GMAIL_ENABLE_WRITE = "true";
  const writable = new McpServer({ name: "multi-gmail", version: "1.0.0" });
  registerTools(writable);
  assert.equal(toolNames(writable).has("create_draft"), true);
  delete process.env.GMAIL_ENABLE_WRITE;
});

function toolNames(server: McpServer): Set<string> {
  const registered = (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools ?? {};
  return new Set(Object.keys(registered));
}
