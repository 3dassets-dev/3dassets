import { AsyncLocalStorage } from 'node:async_hooks';

import { Client, SdkHttpError, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type {
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  ProgressCallback,
  ReadResourceResult,
  ServerCapabilities
} from '@modelcontextprotocol/client';

import type { Config } from './config.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.js';

export function describeUpstreamError(error: unknown): string {
  if (error instanceof SdkHttpError) {
    if (error.status === 401) {
      return '3dassets.dev did not accept the API key. It may have been rotated or mistyped: ' +
        'copy the current one from https://3dassets.dev/account into THREEDASSETS_API_KEY, ' +
        'or unset it to search and download without one.';
    }
    if (error.status === 403) {
      return '3dassets.dev refused the request for this API key (403).';
    }
    if (error.status === 429) {
      return '3dassets.dev rate limit reached. Wait a minute and try again.';
    }
    if (error.status >= 500) {
      return `3dassets.dev is not responding properly (HTTP ${error.status}). Try again shortly.`;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return `Could not reach 3dassets.dev: ${message}. Check your internet connection.`;
  }
  return message;
}

export interface CallToolOptions {
  /** Called for each progress notification the hosted server sends for this call. */
  onprogress?: ProgressCallback;
  /** Aborting it cancels the call on the hosted server. */
  signal?: AbortSignal;
}

type Cursor = { cursor?: string } | undefined;

/** Combines two abort signals (AbortSignal.any needs Node 20.3). */
function eitherSignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => () => controller.abort(signal.reason);
  for (const signal of [a, b]) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', abort(signal), { once: true, signal: controller.signal });
  }
  return controller.signal;
}

/** True for a POST body that is a JSON-RPC request (not a notification or response). */
function isRequestBody(init: RequestInit | undefined): boolean {
  if (init?.method !== 'POST' || typeof init.body !== 'string') return false;
  try {
    const message = JSON.parse(init.body) as { id?: unknown; method?: unknown };
    return message.id !== undefined && typeof message.method === 'string';
  } catch {
    return false;
  }
}

/**
 * A connection to the hosted 3dassets.dev MCP server. It connects on first
 * use and reconnects after a failure, so the local server can start before
 * the network is up.
 */
export class Upstream {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  /** The cancellation signal of the tool call being sent, if any. */
  private readonly callSignal = new AsyncLocalStorage<AbortSignal>();

  constructor(
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /**
   * On a 2025-era connection the client cancels with a notifications/cancelled
   * message, which a stateless server (a fresh instance per HTTP request)
   * cannot match to the running call. Aborting the call's own HTTP request as
   * well closes its response stream, which such a server does notice. On a
   * 2026-07-28 connection closing the stream is how the client cancels anyway.
   */
  private readonly fetchWithCancel: typeof fetch = (input, init) => {
    const signal = this.callSignal.getStore();
    if (signal && isRequestBody(init)) {
      init = { ...init, signal: init?.signal ? eitherSignal(init.signal, signal) : signal };
    }
    return this.fetchImpl(input, init);
  };

  private async connect(): Promise<Client> {
    const headers: Record<string, string> = { 'User-Agent': `${PACKAGE_NAME}/${PACKAGE_VERSION}` };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    const transport = new StreamableHTTPClientTransport(this.config.apiUrl, {
      fetch: this.fetchWithCancel,
      requestInit: { headers }
    });
    // 'auto' asks the server for its protocol versions first (server/discover)
    // and uses 2026-07-28 when it offers it. A 2025-era server does not
    // recognise that request, so the client falls back to the 2025
    // initialize handshake on the same endpoint.
    const client = new Client(
      { name: PACKAGE_NAME, version: PACKAGE_VERSION },
      { capabilities: {}, versionNegotiation: { mode: 'auto' } }
    );
    client.onclose = () => {
      if (this.client === client) this.client = null;
    };
    await client.connect(transport, { timeout: this.config.timeoutMs });
    return client;
  }

  async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = this.connect()
        .then((client) => {
          this.client = client;
          return client;
        })
        .finally(() => {
          this.connecting = null;
        });
    }
    return this.connecting;
  }

  /** What the hosted server says about itself, once connected. */
  async describe(): Promise<{ instructions: string | undefined; capabilities: ServerCapabilities }> {
    const client = await this.getClient();
    return { instructions: client.getInstructions(), capabilities: client.getServerCapabilities() ?? {} };
  }

  /** Runs a request, reconnecting once if the server no longer knows the session. */
  private async withClient<T>(run: (client: Client) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const client = await this.getClient();
    try {
      return await run(client);
    } catch (error) {
      if (error instanceof SdkHttpError && error.status === 404 && !signal?.aborted) {
        await this.reset();
        return run(await this.getClient());
      }
      throw error;
    }
  }

  /**
   * Without a cursor the client walks every page and returns them all; with
   * one it fetches that page only, so a client paging through gets the hosted
   * server's own pages.
   */
  listTools(params: Cursor): Promise<ListToolsResult> {
    return this.withClient((client) => client.listTools(params, { timeout: this.config.timeoutMs }));
  }

  listResources(params: Cursor): Promise<ListResourcesResult> {
    return this.withClient((client) => client.listResources(params, { timeout: this.config.timeoutMs }));
  }

  listResourceTemplates(params: Cursor): Promise<ListResourceTemplatesResult> {
    return this.withClient((client) => client.listResourceTemplates(params, { timeout: this.config.timeoutMs }));
  }

  readResource(uri: string): Promise<ReadResourceResult> {
    return this.withClient((client) => client.readResource({ uri }, { timeout: this.config.timeoutMs }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown> | undefined,
    options: CallToolOptions = {}
  ): Promise<CallToolResult> {
    const { onprogress, signal } = options;
    const send = (client: Client) =>
      client.callTool(
        { name, arguments: args ?? {} },
        {
          timeout: this.config.timeoutMs,
          resetTimeoutOnProgress: true,
          ...(onprogress ? { onprogress } : {}),
          ...(signal ? { signal } : {})
        }
      );
    // Only the call itself runs with the signal, not a (re)connect it waits for.
    return this.withClient((client) => (signal ? this.callSignal.run(signal, () => send(client)) : send(client)), signal);
  }

  async reset(): Promise<void> {
    const client = this.client;
    this.client = null;
    await client?.close().catch(() => {});
  }
}
