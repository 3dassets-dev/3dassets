// Starts the bridge over stdio and checks initialize, tools/list and one read tool against production.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'smoke', version: '0' })
await client.connect(new StdioClientTransport({ command: 'node', args: ['bin/3dassets-mcp.js'] }))
const { tools } = await client.listTools()
if (!tools.some((t) => t.name === 'search_assets')) throw new Error('search_assets missing')
const r = await client.callTool({ name: 'search_assets', arguments: { q: 'tree', limit: 1 } })
if (r.isError) throw new Error('search_assets errored: ' + JSON.stringify(r.content).slice(0, 200))
const { resourceTemplates } = await client.listResourceTemplates()
console.log(`ok: ${tools.length} tools, ${resourceTemplates.length} resource templates, search returned ${JSON.stringify(r.content[0]).slice(0, 80)}...`)
await client.close()
process.exit(0)
