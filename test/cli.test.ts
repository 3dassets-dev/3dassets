import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { INSTRUCTIONS, startFakeUpstream, type FakeUpstream } from './fakeUpstream.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = fileURLToPath(new URL('../dist/index.js', import.meta.url));
let upstream: FakeUpstream;

beforeAll(async () => {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
  upstream = await startFakeUpstream();
}, 60_000);

afterAll(async () => {
  await upstream?.close();
});

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
    input: ''
  });
}

describe('command line', () => {
  it('prints help and version', () => {
    expect(run(['--help']).stdout).toMatch(/THREEDASSETS_API_KEY/);
    expect(run(['--version']).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exits with a clear message on a bad option, writing nothing to stdout', () => {
    const result = run(['--nope']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown option: --nope/);
    expect(result.stdout).toBe('');
  });

  it('serves MCP over stdio end to end', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin],
      env: { PATH: process.env.PATH ?? '', THREEDASSETS_MCP_URL: upstream.url.href },
      stderr: 'pipe'
    });
    const client = new Client({ name: 'cli-test', version: '0.0.0' });
    await client.connect(transport);
    expect(client.getServerVersion()?.name).toBe('3dassets');
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('search_assets');
    const result = await client.callTool({ name: 'search_assets', arguments: { q: 'tree' } });
    expect(JSON.stringify(result.content)).toContain('search_assets');
    await client.close();
  }, 30_000);
});
