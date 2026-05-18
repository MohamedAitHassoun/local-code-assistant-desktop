import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import type {
  OpenRouterChatRequest,
  OpenRouterModel,
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
  onChunk: (delta: string) => void,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const signal = options?.signal;
  const runAttempt = async (): Promise<string> => {
    const requestId = crypto.randomUUID();

    return new Promise<string>((resolve, reject) => {
      let finalText = "";
      let unlisten: UnlistenFn | null = null;
      let settled = false;

      const cleanup = () => {
        if (unlisten) {
          const current = unlisten;
          unlisten = null;
          void current();
        }
        if (signal) {
          signal.removeEventListener("abort", abortHandler);
        }
      };

      const settleResolve = (value: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const abortHandler = () => {
        settleResolve(finalText);
      };

      if (signal?.aborted) {
        settleResolve(finalText);
        return;
      }

      if (signal) {
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      listen<OpenRouterStreamEvent>("openrouter_stream", (event) => {
        const payload = event.payload;
        if (payload.requestId !== requestId) {
          return;
        }

        if (payload.error) {
          if (signal?.aborted) {
            settleResolve(finalText);
            return;
          }
          settleReject(new Error(friendlyOpenRouterError(payload.error)));
          return;
        }

        if (payload.delta) {
          finalText += payload.delta;
          if (!signal?.aborted) {
            onChunk(payload.delta);
          }
        }

        if (payload.done) {
          settleResolve(finalText);
        }
      })
        .then((unlistenFn) => {
          unlisten = unlistenFn;
          if (signal?.aborted) {
            settleResolve(finalText);
            return null;
          }
          return invoke("start_openrouter_chat", { request, requestId });
        })
        .catch((error) => {
          if (signal?.aborted) {
            settleResolve(finalText);
            return;
          }
          settleReject(new Error(friendlyOpenRouterError(extractErrorText(error))));
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

export async function listOpenRouterModels(
  endpoint: string,
  apiKey: string,
  limit = 400
): Promise<OpenRouterModel[]> {
  return invoke("openrouter_list_models", {
    endpoint,
    apiKey,
    limit
  });
}
