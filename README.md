# 3DAssets.dev for agents

Free, web-optimised CC0 GLB models and game asset packs for three.js, React Three Fiber, Blender, Godot, Unity and any glTF-capable tool. This repository holds the machine-readable pieces of https://3dassets.dev in one place for directories and agent tooling that index GitHub:

- `SKILL.md`: the agent skill, a copy of https://3dassets.dev/skill.md (kept in sync daily by a workflow)
- `bin/3dassets-mcp.js`: the `3dassets-mcp` npm package, a stdio bridge to the hosted server
- `.mcp.json`: MCP client configuration for the hosted server
- `server.json`: the official MCP Registry entry
- `llms-install.md`: setup notes for agents that install from a README

The site, the API and the MCP server itself are hosted at 3dassets.dev, so the only code here is the thin stdio bridge; the catalogue is at https://3dassets.dev/assets.

## MCP server

Two ways in. Hosted (Streamable HTTP) needs nothing installed; the npm package runs the same server over stdio for clients that only speak stdio or want a pinned dependency. Both expose the same tools.

```sh
# stdio, via npm (bridges to the hosted server; no local state)
npx -y 3dassets-mcp
```

```json
{
  "mcpServers": {
    "3dassets": { "command": "npx", "args": ["-y", "3dassets-mcp"] }
  }
}
```

Set `THREEDASSETS_API_KEY` in the environment to submit models on the user's behalf; leave it unset for read-only use.

### Hosted endpoint

Streamable HTTP endpoint: `https://3dassets.dev/mcp`. Search and download need no auth. Submitting models on a user's behalf takes their API key as a Bearer token; https://3dassets.dev/auth.md explains how an agent obtains one without the user ever handling a password.

```sh
# Claude Code
claude mcp add --transport http 3dassets https://3dassets.dev/mcp

# Codex CLI
codex mcp add 3dassets --url https://3dassets.dev/mcp

# VS Code
code --add-mcp '{"name":"3dassets","type":"http","url":"https://3dassets.dev/mcp"}'
```

Cursor, Windsurf or any `mcp.json`:

```json
{
  "mcpServers": {
    "3dassets": { "url": "https://3dassets.dev/mcp" }
  }
}
```

Tools: `search_assets`, `search_packs`, `get_pack`, `list_demos`, `get_demo`, `get_asset`, `get_asset_usage`, `list_categories`, `list_tags`, `list_licenses`, `list_ai_models`, `create_account`, `verify_account`, `submit_asset_from_url`, `get_upload_url`, `finalize_upload`, `my_assets`, `update_asset`, `submit_pack`, `my_packs`. Full reference: https://3dassets.dev/docs/mcp.

## Skill

```sh
npx skills add 3dassets-dev/3dassets
```

Or point any agent at https://3dassets.dev/skill.md directly. The skill uses plain HTTP, so it works without MCP.

## REST API

Base `https://3dassets.dev/api/v1`, OpenAPI at https://3dassets.dev/api/v1/openapi.json, guide at https://3dassets.dev/docs/api. Every asset also has a Markdown view at `https://3dassets.dev/assets/{slug}.md`.

## Discovery documents

- https://3dassets.dev/.well-known/mcp/server-card.json
- https://3dassets.dev/.well-known/api-catalog
- https://3dassets.dev/.well-known/agent-skills/index.json
- https://3dassets.dev/.well-known/ai-catalog.json
- https://3dassets.dev/llms.txt

## Licence

Every asset on the site is CC0 1.0. The files in this repository are CC0 1.0 too.

Questions: hello@3dassets.dev
