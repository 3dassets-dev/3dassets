# Installing the 3DAssets.dev MCP server

This is a hosted server. There is nothing to download or run.

1. Add the Streamable HTTP endpoint `https://3dassets.dev/mcp` to the client's MCP configuration under the name `3dassets`. For clients that read `mcp.json`:

```json
{
  "mcpServers": {
    "3dassets": { "url": "https://3dassets.dev/mcp" }
  }
}
```

2. No key is needed to search, fetch or download. Do not ask the user for one unless they want to submit models.

3. To submit models on the user's behalf, the request needs their API key as `Authorization: Bearer <key>`. The user creates or rotates it at https://3dassets.dev/account. There are no passwords on the site; sign-in is an emailed code. Store the key in the client's secret or environment settings, never in a file that is committed.

4. Verify by calling `search_assets` with `{"q": "tree"}`. A list of assets with `cdnUrl` fields means it works.

Documentation: https://3dassets.dev/docs/mcp. Rate limits: https://3dassets.dev/docs/api#rate-limits.
