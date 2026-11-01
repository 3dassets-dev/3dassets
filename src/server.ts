import { Server } from '@modelcontextprotocol/server';
import type { CallToolResult, Progress, ServerContext } from '@modelcontextprotocol/server';

import type { Config } from './config.js';
import { describeUpstreamError, Upstream } from './upstream.js';
import { PACKAGE_VERSION } from './version.js';

/** Used only when the hosted server can't be reached at startup; normally its own instructions are passed on. */
export const FALLBACK_INSTRUCTIONS = [
  '3dassets.dev is a free catalogue of CC0 GLB models and game asset packs for three.js, Blender,',
  'Godot and Unity. Search with search_assets or search_packs, then get_asset or get_pack for CDN URLs',
  'and loader snippets. Submitting models needs the user\'s API key; see https://3dassets.dev/docs/mcp.'
].join(' ');

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

interface ProgressRelay {
  onprogress: (update: Progress) => void;
  /** Resolves once every relayed notification has been sent. */
  flushed(): Promise<void>;
}

/** How long to hold a result back after relaying progress. */
const RESULT_DELAY_MS = 10;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * When our client asked for progress, passes the hosted server's progress on
 * under our client's token. Updates that do not move forward are dropped, as
 * the spec requires progress to increase.
 */
function relayProgress(ctx: ServerContext): ProgressRelay | undefined {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken === undefined) return undefined;
  let last = -Infinity;
  // Sent one after another, so they keep their order.
  let sending = Promise.resolve();
  return {
    onprogress: (update) => {
      if (!(update.progress > last)) return;
      last = update.progress;
      const { progress, total, message } = update;
      sending = sending
        .then(() =>
          ctx.mcpReq.notify({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress,
              ...(total !== undefined ? { total } : {}),
              ...(message !== undefined ? { message } : {})
            }
          })
        )
        .catch((error: unknown) => {
          console.error(`Could not relay progress: ${error instanceof Error ? error.message : String(error)}`);
        });
    },
    // The TypeScript SDK client (v1 and v2) handles a notification a
    // microtask after a response read in the same chunk, so progress written
    // just before the result can reach it after the call has finished, and be
    // dropped. Holding the result back briefly keeps them in separate reads.
    flushed: () => sending.then(() => (last > -Infinity ? delay(RESULT_DELAY_MS) : undefined))
  };
}

/** Thrown errors reach the client as they are, so only throw the sanitised message. */
async function sanitised<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(describeUpstreamError(error));
  }
}

// The SDK marks the low-level Server as for advanced use. This is one: it
// forwards whatever tools and resources the hosted server lists at runtime,
// which McpServer's register-each-one-up-front API can't express.
export async function createServer(config: Config, upstream: Upstream = new Upstream(config)): Promise<Server> {
  // Pass the hosted server's own instructions on, since they carry the submission rules. If it
  // can't be reached yet, start anyway: every request below connects (or reconnects) on demand.
  let instructions = FALLBACK_INSTRUCTIONS;
  try {
    instructions = (await upstream.describe()).instructions ?? FALLBACK_INSTRUCTIONS;
  } catch (error) {
    console.error(`Starting without a connection to 3dassets.dev: ${describeUpstreamError(error)}`);
  }

  const server = new Server(
    { name: '3dassets', version: PACKAGE_VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions }
  );

  server.setRequestHandler('tools/list', (request) => sanitised(() => upstream.listTools(request.params)));

  server.setRequestHandler('tools/call', async (request, ctx) => {
    try {
      const progress = relayProgress(ctx);
      try {
        return await upstream.callTool(request.params.name, request.params.arguments, {
          onprogress: progress?.onprogress,
          // Aborted when our client cancels the request or disconnects, which
          // cancels the call on the hosted server too.
          signal: ctx.mcpReq.signal
        });
      } finally {
        // Progress the hosted server sent just before its result must still
        // reach our client before the result does.
        await progress?.flushed();
      }
    } catch (error) {
      return errorResult(describeUpstreamError(error));
    }
  });

  server.setRequestHandler('resources/list', (request) => sanitised(() => upstream.listResources(request.params)));
  server.setRequestHandler('resources/templates/list', (request) =>
    sanitised(() => upstream.listResourceTemplates(request.params))
  );
  server.setRequestHandler('resources/read', (request) => sanitised(() => upstream.readResource(request.params.uri)));

  server.onclose = () => {
    void upstream.reset();
  };

  return server;
}
