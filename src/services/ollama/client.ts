import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import type {
  OllamaChatRequest,
  OllamaModel,
  OllamaPullStreamEvent,
  OllamaStatus,
  OllamaStreamEvent
} from "@/types";

export async function checkOllamaStatus(endpoint: string): Promise<OllamaStatus> {
  return invoke("ollama_status", { endpoint });
}

export async function listOllamaModels(endpoint: string): Promise<OllamaModel[]> {
  return invoke("ollama_list_models", { endpoint });
}

export async function installOllama(): Promise<string> {
  return invoke("install_ollama");
}

export async function startOllama(endpoint: string): Promise<string> {
  return invoke("start_ollama", { endpoint });
}

export async function streamOllamaPull(
  endpoint: string,
  model: string,
  onProgress: (event: OllamaPullStreamEvent) => void
): Promise<void> {
  const requestId = crypto.randomUUID();

  return new Promise<void>((resolve, reject) => {
    let unlisten: UnlistenFn | null = null;

    const cleanup = () => {
      if (!unlisten) return;
      const current = unlisten;
      unlisten = null;
      void current();
    };

    listen<OllamaPullStreamEvent>("ollama_pull_stream", (event) => {
      const payload = event.payload;
      if (payload.requestId !== requestId) {
        return;
      }

      if (payload.error) {
        cleanup();
        reject(new Error(payload.error));
        return;
      }

      onProgress(payload);

      if (payload.done) {
        cleanup();
        resolve();
      }
    })
      .then((unlistenFn) => {
        unlisten = unlistenFn;
        return invoke("start_ollama_pull", { endpoint, model, requestId });
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}

export async function streamOllamaChat(
  request: OllamaChatRequest,
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

    listen<OllamaStreamEvent>("ollama_stream", (event) => {
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
        return invoke("start_ollama_chat", { request, requestId });
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}
