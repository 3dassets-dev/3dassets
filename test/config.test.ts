import { describe, expect, it } from 'vitest';

import { ConfigError, DEFAULT_API_URL, DEFAULT_TIMEOUT_MS, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('needs nothing set', () => {
    const config = loadConfig({}, []);
    expect(config.apiKey).toBeUndefined();
    expect(config.apiUrl.href).toBe(DEFAULT_API_URL);
    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('reads the API key under the current and the old name, preferring the current one', () => {
    expect(loadConfig({ THREEDASSETS_API_KEY: ' a ' }, []).apiKey).toBe('a');
    expect(loadConfig({ THREEJSASSETS_API_KEY: 'b' }, []).apiKey).toBe('b');
    expect(loadConfig({ THREEDASSETS_API_KEY: 'a', THREEJSASSETS_API_KEY: 'b' }, []).apiKey).toBe('a');
    expect(loadConfig({ THREEDASSETS_API_KEY: '  ' }, []).apiKey).toBeUndefined();
  });

  it('lets flags override the environment', () => {
    const config = loadConfig(
      { THREEDASSETS_MCP_URL: 'https://example.com/mcp', THREEDASSETS_TIMEOUT_MS: '5000' },
      ['--api-url=http://localhost:3000/mcp', '--timeout-ms', '9000']
    );
    expect(config.apiUrl.href).toBe('http://localhost:3000/mcp');
    expect(config.timeoutMs).toBe(9000);
  });

  it('refuses an API key flag, so the key stays out of process lists', () => {
    expect(() => loadConfig({}, ['--api-key', 'x'])).toThrow(/environment variable/);
  });

  it.each([
    [{ THREEDASSETS_MCP_URL: 'not a url' }, [], /not a valid URL/],
    [{ THREEDASSETS_MCP_URL: 'http://3dassets.dev/mcp' }, [], /must use https/],
    [{ THREEDASSETS_TIMEOUT_MS: '10' }, [], /1000 or more/],
    [{}, ['--timeout-ms'], /needs a value/],
    [{}, ['--read-only'], /Unknown option/]
  ])('rejects %j %j', (env, argv, message) => {
    expect(() => loadConfig(env, argv)).toThrow(ConfigError);
    expect(() => loadConfig(env, argv)).toThrow(message);
  });
});
