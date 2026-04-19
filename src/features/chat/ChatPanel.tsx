import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage, OllamaStatus } from "@/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onboardingMessage: string | null;
  ollamaStatus: OllamaStatus | null;
  onSend: (prompt: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onInstallOllama: () => Promise<void>;
  onStartOllama: () => Promise<void>;
  onRefreshOllama: () => Promise<void>;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[95%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
          isUser
            ? "bg-accent text-white"
            : message.role === "assistant"
              ? "border border-border bg-white text-ink"
              : "bg-slate-100 text-ink/80"
        )}
      >
        {message.content || "..."}
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  loading,
  error,
  onboardingMessage,
  ollamaStatus,
  onSend,
  onClearHistory,
  onInstallOllama,
  onStartOllama,
  onRefreshOllama
}: ChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [actionBusy, setActionBusy] = useState<null | "install" | "start" | "refresh">(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loading]);

  const handleSubmit = async () => {
    const cleaned = prompt.trim();
    if (!cleaned || loading) {
      return;
    }

    setPrompt("");
    await onSend(cleaned);
  };

  const runAction = async (
    action: "install" | "start" | "refresh",
    handler: () => Promise<void>
  ) => {
    if (actionBusy) return;
    setActionBusy(action);
    try {
      await handler();
    } catch {
      // Errors are surfaced by parent app state.
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-panel/95">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/70">AI Assistant</h2>
        <button
          type="button"
          onClick={() => void onClearHistory()}
          className="rounded border border-border bg-white px-2 py-1 text-xs text-ink hover:bg-slate-100"
        >
          Clear
        </button>
      </div>

      {onboardingMessage && (
        <div className="m-3 rounded-lg border border-warning/30 bg-amber-50 px-3 py-2 text-xs text-warning">
          <p>{onboardingMessage}</p>
          {ollamaStatus?.detectedPath && (
            <p className="mt-1 break-all text-[11px] text-warning/90">
              Detected binary: {ollamaStatus.detectedPath}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {!ollamaStatus?.installed && (
              <button
                type="button"
                onClick={() => void runAction("install", onInstallOllama)}
                disabled={Boolean(actionBusy)}
                className="rounded border border-warning/40 bg-white px-2 py-1 text-[11px] text-warning hover:bg-amber-100 disabled:opacity-60"
              >
                {actionBusy === "install" ? "Opening..." : "Install Ollama"}
              </button>
            )}
            {ollamaStatus?.installed && !ollamaStatus.running && (
              <button
                type="button"
                onClick={() => void runAction("start", onStartOllama)}
                disabled={Boolean(actionBusy)}
                className="rounded border border-warning/40 bg-white px-2 py-1 text-[11px] text-warning hover:bg-amber-100 disabled:opacity-60"
              >
                {actionBusy === "start" ? "Starting..." : "Start Ollama"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void runAction("refresh", onRefreshOllama)}
              disabled={Boolean(actionBusy)}
              className="rounded border border-warning/40 bg-white px-2 py-1 text-[11px] text-warning hover:bg-amber-100 disabled:opacity-60"
            >
              {actionBusy === "refresh" ? "Refreshing..." : "Refresh status"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="m-3 rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-slate-50 p-3 text-sm text-ink/70">
            Ask anything about your code. You can also use editor actions like Explain, Fix, Refactor, and Generate tests.
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      <div className="border-t border-border p-3">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Ask a programming question... (Ctrl/Cmd + Enter to send)"
          className="h-28 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-accent/30 placeholder:text-ink/50 focus:ring"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-ink/50">Everything stays local by default.</span>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || !prompt.trim()}
            className="rounded border border-accent bg-accent px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Thinking..." : "Send"}
          </button>
        </div>
      </div>
    </aside>
  );
}
