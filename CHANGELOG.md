# Changelog

## 1.1.0

- Moved from `@modelcontextprotocol/sdk` 1.x, which only gets fixes until early 2027, to the
  v2 packages (`@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4).
- Serves MCP clients that speak the 2026-07-28 protocol revision as well as 2025-era ones.
- Connects to the hosted server with whichever protocol revision it speaks: it asks for
  2026-07-28 first and falls back to the 2025 handshake.
- Starts even when 3dassets.dev can't be reached, and connects on the first request instead of
  exiting.
- Passes progress from long-running tools on to your client, when the client asks for it.
- Cancelling a tool call in your client, or closing the client, now cancels the call on the
  hosted server too.
- Clear messages for a rejected API key, rate limits and outages, without echoing the key.
- Anything a dependency logs now goes to stderr, so it can't corrupt the MCP stream on stdout.
- `--help`, `--version`, `--api-url` and `--timeout-ms`, and a `THREEDASSETS_TIMEOUT_MS` setting.
- Needs Node.js 20 or later (was 18, which is end of life).

## 1.0.0

First release: a stdio bridge to `https://3dassets.dev/mcp`.
