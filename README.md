# 3DAssets.dev for agents

Free, web-optimised CC0 GLB models and game asset packs for three.js, React Three Fiber, Blender, Godot, Unity and any glTF-capable tool. This repository holds the machine-readable pieces of https://3dassets.dev in one place for directories and agent tooling that index GitHub:

- `SKILL.md`: the agent skill, a copy of https://3dassets.dev/skill.md (kept in sync daily by a workflow)
- `.mcp.json`: MCP client configuration for the hosted server
- `server.json`: the official MCP Registry entry
- `llms-install.md`: setup notes for agents that install from a README

There is no code here. The site, the API and the MCP server are hosted at 3dassets.dev; the catalogue is at https://3dassets.dev/assets.

## MCP server

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
