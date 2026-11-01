# Contributing

Issues and pull requests are welcome.

## What belongs here

The `3dassets-mcp` package is a thin bridge: it lists and calls the tools and resources the hosted
3dassets.dev MCP server offers. New tools, and changes to what a tool does, are made on
3dassets.dev, so please open an issue rather than adding tool logic here. `SKILL.md` is copied
from https://3dassets.dev/skill.md by a daily workflow, so edits to it here are overwritten.

## Development

You need Node.js 22 or later to run the tests (the package itself runs on 20).

```bash
npm install
npm run typecheck
npm test
npm run build
```

The tests run against a local stand-in for the hosted server (`test/fakeUpstream.ts`), so they
need no network access. `npm run smoke` checks the built bridge against production.

## Releasing

1. Bump `version` in `package.json`, and both `version` fields in `server.json` (the entry's and
   the npm package's).
2. Add a CHANGELOG entry.
3. `npm publish` (runs the typecheck, tests and build first), then publish `server.json` to the
   MCP Registry with `mcp-publisher publish`.

By contributing you agree that your contributions are dedicated to the public domain under
[CC0 1.0](LICENSE).
