import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage, OllamaStatus } from "@/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onboardingMessage: string | null;
  aiProvider: "ollama" | "openrouter";
  ollamaStatus: OllamaStatus | null;
  autoApproveEnabled: boolean;
  attachedFileCount: number;
  onSend: (prompt: string) => Promise<void>;
  onAttachFiles: () => Promise<void>;
  onClearAttachedFiles: () => void;
  onClearHistory: () => Promise<void>;
  onInstallOllama: () => Promise<void>;
  onStartOllama: () => Promise<void>;
  onRefreshOllama: () => Promise<void>;
  onToggleAutoApprove: () => void;
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
  aiProvider,
  ollamaStatus,
  autoApproveEnabled,
  attachedFileCount,
  onSend,
  onAttachFiles,
  onClearAttachedFiles,
  onClearHistory,
  onInstallOllama,
  onStartOllama,
  onRefreshOllama,
  onToggleAutoApprove
}: ChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [actionBusy, setActionBusy] = useState<null | "install" | "start" | "refresh" | "attach">(
    null
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);

  useEffect(() => {
    const container = scrollRef.current;
    if (container && autoScrollEnabledRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loading]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    autoScrollEnabledRef.current = distanceFromBottom < 48;
  };

  const handleSubmit = async () => {
    const cleaned = prompt.trim();
    if (!cleaned || loading) {
      return;
    }

    autoScrollEnabledRef.current = true;
    setPrompt("");
    await onSend(cleaned);
    if (attachedFileCount > 0) {
      onClearAttachedFiles();
    }
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

  const handleAttachFiles = async () => {
    if (actionBusy) {
      return;
    }

    setActionBusy("attach");
    try {
      await onAttachFiles();
    } catch {
      // Errors are surfaced by parent app state.
    } finally {
      setActionBusy(null);
    }
  };

  const providerHint =
    aiProvider === "openrouter"
      ? "Using managed OpenRouter API for responses."
      : "Everything stays local with Ollama.";

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-panel/95">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/70">AI Assistant</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleAutoApprove}
            className={cn(
              "rounded border px-2 py-1 text-[11px]",
              autoApproveEnabled
                ? "border-success/40 bg-emerald-50 text-success hover:bg-emerald-100"
                : "border-border bg-white text-ink hover:bg-slate-100"
            )}
          >
            Auto approve {autoApproveEnabled ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => void onClearHistory()}
            className="rounded border border-border bg-white px-2 py-1 text-xs text-ink hover:bg-slate-100"
          >
            Clear
          </button>
        </div>
      </div>

      {onboardingMessage && (
        <div className="m-3 rounded-lg border border-warning/30 bg-amber-50 px-3 py-2 text-xs text-warning">
          <p>{onboardingMessage}</p>
          {aiProvider === "ollama" && (
            <>
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
            </>
          )}
        </div>
      )}

      {error && (
        <div className="m-3 rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-slate-50 p-3 text-sm text-ink/70">
            Ask anything about your code. You can also use editor actions like Explain, Fix, Refactor, and Generate tests.
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      <div className="border-t border-border p-3">
        {loading && (
          <div className="mb-2 rounded border border-accent/20 bg-accentSoft px-3 py-2 text-xs text-accent">
            AI is still working on your request...
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          disabled={loading}
          placeholder={
            loading
              ? "AI is working... please wait until it finishes."
              : "Ask a programming question... (Enter to send, Shift+Enter for new line)"
          }
          className="h-28 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-accent/30 placeholder:text-ink/50 focus:ring disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-ink/60"
        />
        {attachedFileCount > 0 && (
          <div className="mt-2 flex items-center justify-between rounded border border-border bg-slate-50 px-2 py-1 text-[11px] text-ink/70">
            <span>
              {attachedFileCount} file{attachedFileCount === 1 ? "" : "s"} attached to next message
            </span>
            <button
              type="button"
              onClick={onClearAttachedFiles}
              className="rounded border border-border bg-white px-2 py-0.5 text-[11px] text-ink hover:bg-slate-100"
            >
              Clear files
            </button>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-ink/50">
            {loading ? "Please wait until the current task is finished." : providerHint}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAttachFiles()}
              disabled={Boolean(actionBusy) || loading}
              className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionBusy === "attach" ? "Attaching..." : "Attach file"}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading || !prompt.trim()}
              className="rounded border border-accent bg-accent px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Working..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
