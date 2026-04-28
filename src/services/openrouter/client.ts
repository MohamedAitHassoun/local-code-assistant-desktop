import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import type {
  OpenRouterChatRequest,
  OpenRouterStreamEvent
} from "@/types";

export async function streamOpenRouterChat(
  request: OpenRouterChatRequest,
  onChunk: (delta: string) => void
): Promise<string> {
  const requestId = crypto.randomUUID();

  return new Promise<string>((resolve, reject) => {
    let finalText = "";
    let unlisten: UnlistenFn | null = null;

    const cleanup = () => {
      if (!unlisten) return;
      const current = unlisten;
      unlisten = null;
      void current();
    };

    listen<OpenRouterStreamEvent>("openrouter_stream", (event) => {
      const payload = event.payload;
      if (payload.requestId !== requestId) {
        return;
      }

      if (payload.error) {
        cleanup();
        reject(new Error(payload.error));
        return;
      }

      if (payload.delta) {
        finalText += payload.delta;
        onChunk(payload.delta);
      }

      if (payload.done) {
        cleanup();
        resolve(finalText);
      }
    })
      .then((unlistenFn) => {
        unlisten = unlistenFn;
        return invoke("start_openrouter_chat", { request, requestId });
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}
