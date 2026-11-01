import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Client } from '@modelcontextprotocol/client';
import type { CallToolResult, Progress } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { loadConfig } from '../src/config.js';
import { createServer, FALLBACK_INSTRUCTIONS } from '../src/server.js';
import {
  FAKE_RESOURCES,
  FAKE_TEMPLATES,
  FAKE_TOOLS,
  INSTRUCTIONS,
  startFakeUpstream,
  VALID_KEY,
  type FakeUpstream,
  type FakeUpstreamMode
} from './fakeUpstream.js';

type ClientEra = 'legacy' | 'modern';

/**
 * Serves the bridge through serveStdio, as dist/index.js does, over an
 * in-memory pair, and connects a real client in the given protocol era.
 */
async function connect(upstream: FakeUpstream, era: ClientEra, env: Record<string, string> = {}) {
  const config = loadConfig({ THREEDASSETS_MCP_URL: upstream.url.href, ...env }, []);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => createServer(config), { transport: serverTransport });
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {}
  );
  await client.connect(clientTransport);
  expect(client.getProtocolEra()).toBe(era);
  return {
    client,
    close: async () => {
      await client.close();
      await handle.close();
    }
  };
}

function text(result: CallToolResult): string {
  return result.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

const matrix: [FakeUpstreamMode, ClientEra][] = [
  ['modern', 'legacy'],
  ['modern', 'modern'],
  ['legacy', 'legacy'],
  ['legacy', 'modern']
];

describe.each(matrix)('proxy to a %s hosted server, for a %s client', (upstreamMode, clientEra) => {
  let upstream: FakeUpstream;
  const open = (env?: Record<string, string>) => connect(upstream, clientEra, env);

  beforeAll(async () => {
    upstream = await startFakeUpstream({ mode: upstreamMode, pageSize: 3 });
  });

  afterAll(async () => {
    await upstream.close();
  });

  it('negotiates the protocol era the hosted server speaks', async () => {
    const { client, close } = await open();
    const before = upstream.eras.length;
    await client.listTools();
    const eras = upstream.eras.slice(before);
    expect(eras.length).toBeGreaterThan(0);
    expect(new Set(eras)).toEqual(new Set([upstreamMode]));
    if (upstreamMode === 'modern') {
      expect(upstream.requests.at(-1)?.['mcp-protocol-version']).toBe('2026-07-28');
    }
    await close();
  });

  it('passes on the hosted server\'s instructions and names itself 3dassets', async () => {
    const { client, close } = await open();
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
    expect(client.getServerVersion()?.name).toBe('3dassets');
    await close();
  });

  it('lists every hosted tool untouched, across pages', async () => {
    const { client, close } = await open();
    const pagesBefore = upstream.pages.length;
    const { tools } = await client.listTools();
    expect(upstream.pages.slice(pagesBefore)).toEqual(['', '3']);
    expect(tools).toEqual(FAKE_TOOLS);
    await close();
  });

  it('passes resources and resource templates through', async () => {
    const { client, close } = await open();
    expect((await client.listResources()).resources).toEqual(FAKE_RESOURCES);
    expect((await client.listResourceTemplates()).resourceTemplates).toEqual(FAKE_TEMPLATES);
    const read = await client.readResource({ uri: 'https://3dassets.dev/assets/oak-tree.md' });
    expect(read.contents[0]).toMatchObject({ text: '# https://3dassets.dev/assets/oak-tree.md' });
    await close();
  });

  it('sends a user agent, and no API key when none is set', async () => {
    const { client, close } = await open();
    await client.listTools();
    const last = upstream.requests.at(-1);
    expect(last?.authorization).toBeUndefined();
    expect(last?.['user-agent']).toMatch(/^3dassets-mcp\//);
    const result = await client.callTool({ name: 'my_assets', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/needs an API key/);
    await close();
  });

  it('sends the API key when one is set, under either variable name', async () => {
    for (const name of ['THREEDASSETS_API_KEY', 'THREEJSASSETS_API_KEY']) {
      const { client, close } = await open({ [name]: VALID_KEY });
      const result = await client.callTool({ name: 'my_assets', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(upstream.requests.at(-1)?.authorization).toBe(`Bearer ${VALID_KEY}`);
      await close();
    }
  });

  it('calls the hosted tool and passes arguments and structured content through', async () => {
    const { client, close } = await open();
    await client.listTools();
    const result = await client.callTool({ name: 'get_asset', arguments: { slug: 'oak-tree' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ slug: 'oak-tree' });
    expect(upstream.calls.at(-1)).toEqual({ name: 'get_asset', arguments: { slug: 'oak-tree' } });
    await close();
  });

  it('relays progress under the client\'s token, always moving forward', async () => {
    const { client, close } = await open();
    const updates: Progress[] = [];
    const result = await client.callTool(
      { name: 'finalize_upload', arguments: { uploadId: 'u1' } },
      { onprogress: (update) => updates.push(update) }
    );
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result)).progressToken).toBeDefined();
    expect(updates).toEqual([
      { progress: 1, total: 3, message: 'Step 1' },
      { progress: 2, total: 3, message: 'Step 2' },
      { progress: 3, total: 3, message: 'Step 3' }
    ]);
    await close();
  });

  it('asks the hosted server for no progress when the client did not', async () => {
    const { client, close } = await open();
    const result = await client.callTool({ name: 'finalize_upload', arguments: { uploadId: 'u1' } });
    expect(JSON.parse(text(result)).progressToken).toBeUndefined();
    await close();
  });

  it('cancels the hosted call when the client cancels', async () => {
    const { client, close } = await open();
    await client.listTools();
    const controller = new AbortController();
    const started = upstream.waitForCall('slow_export');
    const call = client.callTool({ name: 'slow_export', arguments: {} }, { signal: controller.signal });
    await started;
    const cancelledBefore = upstream.cancelled.length;
    controller.abort('the person clicked Stop');
    await expect(call).rejects.toThrow(/clicked Stop/);
    await vi.waitFor(() => expect(upstream.cancelled.length).toBe(cancelledBefore + 1), { timeout: 5_000 });
    await close();
  });

  it('cancels the hosted call when the client disconnects', async () => {
    const { client, close } = await open();
    await client.listTools();
    const started = upstream.waitForCall('slow_export');
    const call = client.callTool({ name: 'slow_export', arguments: {} }).catch(() => undefined);
    await started;
    const cancelledBefore = upstream.cancelled.length;
    await close();
    await call;
    await vi.waitFor(() => expect(upstream.cancelled.length).toBe(cancelledBefore + 1), { timeout: 5_000 });
  });

  it('reconnects when the hosted server has forgotten the session (404)', async () => {
    const { client, close } = await open();
    await client.listTools();
    upstream.failNext(404);
    const result = await client.callTool({ name: 'search_assets', arguments: { q: 'tree' } });
    expect(result.isError).toBeFalsy();
    await close();
  });

  it.each([
    [429, /rate limit reached/],
    [503, /not responding properly \(HTTP 503\)/]
  ])('explains an HTTP %i from the hosted server', async (status, message) => {
    const { client, close } = await open();
    await client.listTools();
    upstream.failNext(status);
    const result = await client.callTool({ name: 'search_assets', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(message);
    await close();
  });

  it('explains a rejected API key without echoing it', async () => {
    const { client, close } = await open({ THREEDASSETS_API_KEY: '3da_wrong' });
    expect(client.getInstructions()).toBe(FALLBACK_INSTRUCTIONS);
    await expect(client.listTools()).rejects.toThrow(/did not accept the API key/);
    const result = await client.callTool({ name: 'search_assets', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/did not accept the API key/);
    expect(text(result)).not.toContain('3da_wrong');
    await close();
  });

  it('starts while offline and explains an unreachable server', async () => {
    const { client, close } = await open({ THREEDASSETS_MCP_URL: 'http://127.0.0.1:9/mcp' });
    expect(client.getInstructions()).toBe(FALLBACK_INSTRUCTIONS);
    const result = await client.callTool({ name: 'search_assets', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Could not reach 3dassets\.dev/);
    await close();
  });
});
