#!/usr/bin/env node
// Stdio bridge to the hosted 3dassets.dev MCP server.
//
// Clients that only speak stdio (or that want a package they can pin) run this; everything else
// is forwarded to https://3dassets.dev/mcp over Streamable HTTP. There is no local state and no
// local tool logic: tools, resources and their results come from the hosted server, so this
// package never needs a release when the catalogue or the tool set changes.
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { ConfigError, DEFAULT_API_URL, loadConfig } from './config.js';
import { createServer } from './server.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.js';

const HELP = `${PACKAGE_NAME} ${PACKAGE_VERSION}
MCP server for 3dassets.dev: free CC0 GLB models and game asset packs. Speaks MCP over stdio;
start it from your MCP client.

Environment:
  THREEDASSETS_API_KEY     Optional. Your API key from https://3dassets.dev/account, needed only
                           to submit models. Search and download work without it.
  THREEDASSETS_TIMEOUT_MS  Per-request timeout in milliseconds (default 120000).
  THREEDASSETS_MCP_URL     MCP endpoint (default ${DEFAULT_API_URL}).

Options (override the environment):
  --timeout-ms <ms>  Per-request timeout.
  --api-url <url>    MCP endpoint.
  --help, --version
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${PACKAGE_VERSION}\n`);
    return;
  }

  const config = loadConfig(process.env, argv);
  // stdout carries the protocol. Send any console output from dependencies
  // (in Node, console.log, info and debug write to stdout) to stderr instead.
  console.log = console.info = console.debug = console.error;
  // serveStdio answers both 2025-era clients (initialize) and 2026-07-28
  // clients (server/discover) from the same factory.
  const handle = serveStdio(() => createServer(config), {
    onerror: (error) => console.error(`${PACKAGE_NAME}: ${error.message}`)
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void handle.close().finally(() => process.exit(0));
    });
  }
  console.error(`${PACKAGE_NAME} ${PACKAGE_VERSION} ready (${config.apiUrl.host}${config.apiKey ? ', with API key' : ', read-only'})`);
}

main().catch((error: unknown) => {
  const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
  console.error(`${PACKAGE_NAME}: ${message}`);
  process.exit(1);
});
