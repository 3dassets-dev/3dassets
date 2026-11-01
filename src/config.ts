export const DEFAULT_API_URL = 'https://3dassets.dev/mcp';
export const DEFAULT_TIMEOUT_MS = 120_000;

export interface Config {
  /** Only needed to submit models on the user's behalf. Search and download work without it. */
  apiKey: string | undefined;
  apiUrl: URL;
  timeoutMs: number;
}

export class ConfigError extends Error {}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new ConfigError(`${flag} needs a value.`);
  }
  return value;
}

/**
 * Builds the configuration from environment variables, then command-line
 * flags. The API key is read from the environment only, so it never shows in
 * process lists or shell history.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): Config {
  let apiUrl = env.THREEDASSETS_MCP_URL?.trim() || DEFAULT_API_URL;
  let timeoutSetting = env.THREEDASSETS_TIMEOUT_MS?.trim();

  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inlineValue] = argv[i].split(/=(.*)/s, 2);
    const value = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = readFlagValue(argv, i, flag);
      i += 1;
      return next;
    };

    switch (flag) {
      case '--api-url':
        apiUrl = value();
        break;
      case '--timeout-ms':
        timeoutSetting = value();
        break;
      case '--api-key':
        throw new ConfigError('Pass the API key in the THREEDASSETS_API_KEY environment variable, not as a flag.');
      default:
        throw new ConfigError(`Unknown option: ${argv[i]}. Run with --help to see the options.`);
    }
  }

  // THREEJSASSETS_API_KEY is the name from before the rename, still accepted.
  const apiKey = env.THREEDASSETS_API_KEY?.trim() || env.THREEJSASSETS_API_KEY?.trim() || undefined;

  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new ConfigError(`THREEDASSETS_MCP_URL is not a valid URL: ${apiUrl}`);
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new ConfigError('THREEDASSETS_MCP_URL must use https (http is allowed for localhost only).');
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (timeoutSetting) {
    timeoutMs = Number(timeoutSetting);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
      throw new ConfigError('The timeout must be a whole number of milliseconds, 1000 or more.');
    }
  }

  return { apiKey, apiUrl: url, timeoutMs };
}
