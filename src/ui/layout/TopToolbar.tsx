import { cn } from "@/lib/utils";
import type { OllamaStatus } from "@/types";

interface TopToolbarProps {
  onOpenFile: () => void;
  onOpenProject: () => void;
  onSave: () => void;
  onSummarizeFile: () => void;
  onSummarizeProject: () => void;
  onOpenSettings: () => void;
  activeModel: string;
  hasDirtyFile: boolean;
  ollamaStatus: OllamaStatus | null;
}

function StatusChip({ status }: { status: OllamaStatus | null }) {
  if (!status) {
    return (
      <span className="rounded-full border border-border/80 bg-white/70 px-3 py-1 text-xs text-ink/70">
        Checking Ollama...
      </span>
    );
  }

  if (!status.installed) {
    return (
      <span className="rounded-full border border-danger/40 bg-red-50 px-3 py-1 text-xs text-danger">
        Ollama not installed
      </span>
    );
  }

  if (!status.running) {
    return (
      <span className="rounded-full border border-warning/40 bg-amber-50 px-3 py-1 text-xs text-warning">
        Ollama not running
      </span>
    );
  }

  return (
    <span className="rounded-full border border-success/40 bg-emerald-50 px-3 py-1 text-xs text-success">
      Ollama connected
    </span>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  primary = false
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        primary
          ? "border-accent bg-accent text-white hover:bg-blue-600"
          : "border-border bg-panel text-ink hover:bg-slate-100"
      )}
    >
      {label}
    </button>
  );
}

export function TopToolbar({
  onOpenFile,
  onOpenProject,
  onSave,
  onSummarizeFile,
  onSummarizeProject,
  onOpenSettings,
  activeModel,
  hasDirtyFile,
  ollamaStatus
}: TopToolbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-panel/90 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <ToolbarButton label="Open File" onClick={onOpenFile} />
        <ToolbarButton label="Open Project" onClick={onOpenProject} />
        <ToolbarButton label="Save" onClick={onSave} disabled={!hasDirtyFile} primary />
      </div>

      <div className="hidden items-center gap-2 md:flex">
        <ToolbarButton label="Summarize File" onClick={onSummarizeFile} />
        <ToolbarButton label="Summarize Project" onClick={onSummarizeProject} />
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full border border-accent/30 bg-accentSoft px-3 py-1 text-xs text-accent">
          {activeModel}
        </span>
        <StatusChip status={ollamaStatus} />
        <ToolbarButton label="Settings" onClick={onOpenSettings} />
      </div>
    </header>
  );
}
