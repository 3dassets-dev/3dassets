// Starts the built bridge over stdio and checks the handshake, tools/list, one read tool and the
// resource templates against production. Run with `npm run smoke`; it needs network access.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'smoke', version: '0' }, { versionNegotiation: { mode: 'auto' } });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'], stderr: 'inherit' }));
const { tools } = await client.listTools();
if (!tools.some((t) => t.name === 'search_assets')) throw new Error('search_assets missing');
const r = await client.callTool({ name: 'search_assets', arguments: { q: 'tree', limit: 1 } });
if (r.isError) throw new Error('search_assets errored: ' + JSON.stringify(r.content).slice(0, 200));
const { resourceTemplates } = await client.listResourceTemplates();
console.log(
  `ok (${client.getProtocolEra()} era): ${tools.length} tools, ${resourceTemplates.length} resource templates, ` +
    `search returned ${JSON.stringify(r.content[0]).slice(0, 80)}...`
);
await client.close();
process.exit(0);
