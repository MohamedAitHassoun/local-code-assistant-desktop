import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import type {
  OpenRouterChatRequest,
  OpenRouterStreamEvent
} from "@/types";

function extractErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; error?: unknown };
    if (typeof maybe.message === "string") {
      return maybe.message;
    }
    if (typeof maybe.error === "string") {
      return maybe.error;
    }
  }

  return "OpenRouter request failed.";
}

function isRateLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("rate-limited")
  );
}

function friendlyOpenRouterError(message: string): string {
  if (isRateLimitMessage(message)) {
    return "OpenRouter is temporarily rate-limited (429). Wait about 20-60 seconds and try again. If this keeps happening, use a key/model with higher limits.";
  }

  if (message.toLowerCase().includes("api key")) {
    return "OpenRouter API key is invalid or missing for this build.";
  }

  return message;
}

export async function streamOpenRouterChat(
  request: OpenRouterChatRequest,
  onChunk: (delta: string) => void
): Promise<string> {
  const runAttempt = async (): Promise<string> => {
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
          reject(new Error(friendlyOpenRouterError(payload.error)));
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
          reject(new Error(friendlyOpenRouterError(extractErrorText(error))));
        });
    });
  };

  try {
    return await runAttempt();
  } catch (error) {
    const message = friendlyOpenRouterError(extractErrorText(error));
    if (!isRateLimitMessage(message)) {
      throw new Error(message);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));

    try {
      return await runAttempt();
    } catch (retryError) {
      throw new Error(friendlyOpenRouterError(extractErrorText(retryError)));
    }
  }
}
