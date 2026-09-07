#!/usr/bin/env node
// Stdio bridge to the hosted 3dassets.dev MCP server.
//
// Clients that only speak stdio (or that want a package they can pin) run this; everything else
// is forwarded verbatim to https://3dassets.dev/mcp over Streamable HTTP. There is no local
// state and no local logic: tools, resources and their results come from the hosted server, so
// this package never needs a release when the catalogue or the tool set changes.
//
// THREEDASSETS_API_KEY (or THREEJSASSETS_API_KEY) is sent as a Bearer token when set. It is only
// needed to submit models on the user's behalf; search and download work without it.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const URL = process.env.THREEDASSETS_MCP_URL || 'https://3dassets.dev/mcp'
const KEY = process.env.THREEDASSETS_API_KEY || process.env.THREEJSASSETS_API_KEY
const VERSION = '1.0.0'

const upstream = new Client({ name: '3dassets-mcp', version: VERSION })
await upstream.connect(
  new StreamableHTTPClientTransport(new globalThis.URL(URL), {
    requestInit: KEY ? { headers: { Authorization: `Bearer ${KEY}` } } : undefined,
  }),
)

const caps = upstream.getServerCapabilities() ?? {}
const server = new Server(
  { name: '3dassets', version: VERSION },
  { capabilities: { tools: caps.tools ?? {}, resources: caps.resources ?? {} }, instructions: upstream.getInstructions() },
)

server.setRequestHandler(ListToolsRequestSchema, (req) => upstream.listTools(req.params))
server.setRequestHandler(CallToolRequestSchema, (req) => upstream.callTool(req.params))
server.setRequestHandler(ListResourcesRequestSchema, (req) => upstream.listResources(req.params))
server.setRequestHandler(ListResourceTemplatesRequestSchema, (req) => upstream.listResourceTemplates(req.params))
server.setRequestHandler(ReadResourceRequestSchema, (req) => upstream.readResource(req.params))

await server.connect(new StdioServerTransport())
