import { createServer as createHttpServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { NodeStreamableHTTPServerTransport, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, Server } from '@modelcontextprotocol/server';
import type { Resource, ResourceTemplateType, ServerContext, Tool } from '@modelcontextprotocol/server';

export const VALID_KEY = '3da_test_key';
export const INSTRUCTIONS = 'Hosted instructions: CC0 only, ask before submitting.';

/** A stand-in for the hosted MCP server. */
export const FAKE_TOOLS: Tool[] = [
  {
    name: 'search_assets',
    title: 'Search assets',
    description: 'Search assets.',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  },
  {
    name: 'get_asset',
    description: 'Get one asset.',
    inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
    outputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug']
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'my_assets',
    description: 'The caller\'s assets. Needs an API key.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } }
  },
  {
    name: 'finalize_upload',
    description: 'Validate an upload, reporting progress.',
    inputSchema: { type: 'object', properties: { uploadId: { type: 'string' } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'slow_export',
    description: 'Runs until it is cancelled.',
    inputSchema: { type: 'object', properties: {} }
  }
];

export const FAKE_RESOURCES: Resource[] = [
  { uri: 'https://3dassets.dev/skill.md', name: 'skill', mimeType: 'text/markdown' }
];

export const FAKE_TEMPLATES: ResourceTemplateType[] = [
  { uriTemplate: 'https://3dassets.dev/assets/{slug}.md', name: 'asset', mimeType: 'text/markdown' }
];

/** Progress values finalize_upload reports. The repeated 2 is dropped by the bridge. */
export const UPLOAD_PROGRESS = [1, 2, 2, 3];

export type FakeUpstreamMode =
  /** Serves 2026-07-28 and 2025-era clients, through createMcpHandler. */
  | 'modern'
  /** Serves 2025-era clients only, statelessly, like the mcp-handler deployment. */
  | 'legacy';

export interface FakeUpstreamOptions {
  mode?: FakeUpstreamMode;
  /** Tools per tools/list page. */
  pageSize?: number;
}

export interface FakeUpstream {
  url: URL;
  mode: FakeUpstreamMode;
  requests: IncomingHttpHeaders[];
  calls: { name: string; arguments: unknown }[];
  /** The protocol era of each server instance the fake built. */
  eras: string[];
  /** Names of tool calls whose abort signal fired. */
  cancelled: string[];
  /** The listed tool pages, by cursor ('' for the first). */
  pages: string[];
  /** Answers the next HTTP request with this status instead of serving it. */
  failNext(status: number): void;
  /** Resolves when a call to this tool has started. */
  waitForCall(name: string): Promise<void>;
  close(): Promise<void>;
}

export async function startFakeUpstream(options: FakeUpstreamOptions = {}): Promise<FakeUpstream> {
  const mode = options.mode ?? 'modern';
  const pageSize = options.pageSize ?? 3;
  const requests: IncomingHttpHeaders[] = [];
  const calls: { name: string; arguments: unknown }[] = [];
  const eras: string[] = [];
  const cancelled: string[] = [];
  const pages: string[] = [];
  const failures: number[] = [];
  const callWaiters: { name: string; resolve: () => void }[] = [];

  function onCall(name: string, args: unknown) {
    calls.push({ name, arguments: args });
    for (const waiter of callWaiters.filter((w) => w.name === name)) {
      callWaiters.splice(callWaiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  }

  function buildServer(era: string, authorization: string | undefined): Server {
    eras.push(era);
    const server = new Server(
      { name: 'fake-3dassets', version: '0.0.0' },
      { capabilities: { tools: { listChanged: true }, resources: { listChanged: true } }, instructions: INSTRUCTIONS }
    );

    server.setRequestHandler('tools/list', async (request) => {
      const cursor = request.params?.cursor ?? '';
      pages.push(cursor);
      const start = cursor ? Number(cursor) : 0;
      const end = start + pageSize;
      return {
        tools: FAKE_TOOLS.slice(start, end),
        ...(end < FAKE_TOOLS.length ? { nextCursor: String(end) } : {})
      };
    });

    server.setRequestHandler('resources/list', async () => ({ resources: FAKE_RESOURCES }));
    server.setRequestHandler('resources/templates/list', async () => ({ resourceTemplates: FAKE_TEMPLATES }));
    server.setRequestHandler('resources/read', async (request) => ({
      contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text: `# ${request.params.uri}` }]
    }));

    server.setRequestHandler('tools/call', async (request, ctx: ServerContext) => {
      const { name, arguments: args } = request.params;
      onCall(name, args);
      if (name === 'my_assets') {
        if (!authorization) return { content: [{ type: 'text', text: 'This tool needs an API key.' }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify({ tool: name, authorization }) }] };
      }
      if (name === 'get_asset') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ tool: name, args }) }],
          structuredContent: { slug: String(args?.slug) }
        };
      }
      if (name === 'finalize_upload') {
        const progressToken = ctx.mcpReq._meta?.progressToken;
        if (progressToken !== undefined) {
          // Sent back to back with the result, so they tend to arrive in one chunk.
          await Promise.all(
            UPLOAD_PROGRESS.map((progress) =>
              ctx.mcpReq.notify({
                method: 'notifications/progress',
                params: { progressToken, progress, total: 3, message: `Step ${progress}` }
              })
            )
          );
        }
        return { content: [{ type: 'text', text: JSON.stringify({ tool: name, args, progressToken }) }] };
      }
      if (name === 'slow_export') {
        const signal = ctx.mcpReq.signal;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 20_000);
          const onAbort = () => {
            cancelled.push(name);
            clearTimeout(timer);
            resolve();
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        });
        return { content: [{ type: 'text', text: 'export finished' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ tool: name, args }) }] };
    });

    return server;
  }

  let currentAuthorization: string | undefined;
  const modern =
    mode === 'modern' ? toNodeHandler(createMcpHandler(({ era }) => buildServer(era, currentAuthorization))) : null;

  const httpServer: HttpServer = createHttpServer(async (req, res) => {
    requests.push(req.headers);
    const authorization = req.headers.authorization;
    // Like the hosted server: no key is fine, a wrong key is a 401.
    if (authorization !== undefined && authorization !== `Bearer ${VALID_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Invalid API key' } }));
      return;
    }
    const failure = failures.shift();
    if (failure !== undefined) {
      res.writeHead(failure, { 'content-type': 'text/plain' }).end(`Failed with ${failure}`);
      return;
    }
    let parsed: unknown;
    // Like 3dassets.dev since OAuth: an anonymous call to a tool that needs an account is a 401 challenge.
    if (!authorization && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}') as { id?: unknown; method?: string; params?: { name?: string } };
      if (body.method === 'tools/call' && body.params?.name === 'my_assets') {
        res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer resource_metadata="x"' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id ?? null, error: { code: -32001, message: 'Sign in' } }));
        return;
      }
      parsed = raw ? JSON.parse(raw) : undefined;
    }
    if (modern) {
      currentAuthorization = authorization;
      await modern(req, res, parsed);
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = parsed === undefined ? '' : JSON.stringify(parsed);
    if (parsed === undefined) for await (const chunk of req) body += chunk;
    // Stateless, one server per request, as the hosted 2025-era endpoint works.
    const server = buildServer('legacy', authorization);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, JSON.parse(body));
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;

  return {
    url: new URL(`http://127.0.0.1:${port}/mcp`),
    mode,
    requests,
    calls,
    eras,
    cancelled,
    pages,
    failNext: (status) => {
      failures.push(status);
    },
    waitForCall: (name) => new Promise((resolve) => callWaiters.push({ name, resolve })),
    close: () =>
      new Promise((resolve) => {
        httpServer.closeAllConnections();
        httpServer.close(() => resolve());
      })
  };
}
