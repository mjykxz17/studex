export const dynamic = "force-dynamic";

import { type SyncEvent } from "@/lib/contracts";
import { runDiscoverySync, runSelectedModuleSync } from "@/lib/sync";

function createEventStream(run: (send: (event: SyncEvent) => void) => Promise<void>) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: SyncEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await run(send);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected sync failure.";
        send({
          status: "error",
          stage: "finalizing",
          message,
        });
      } finally {
        controller.close();
      }
    },
  });
}

export async function GET() {
  return new Response(createEventStream(runDiscoverySync), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { selectedModuleIds?: string[]; syncFiles?: boolean };

  return new Response(
    createEventStream((send) =>
      runSelectedModuleSync(
        {
          selectedModuleIds: Array.isArray(body.selectedModuleIds) ? body.selectedModuleIds.filter(Boolean) : [],
          syncFiles: body.syncFiles !== false,
        },
        send,
      ),
    ),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
}
