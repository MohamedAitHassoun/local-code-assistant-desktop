import { cn } from "@/lib/utils";

interface TopToolbarProps {
  onOpenFile: () => void;
  onOpenProject: () => void;
  onSave: () => void;
  onSummarizeFile: () => void;
  onSummarizeProject: () => void;
  onOpenSettings: () => void;
  hasDirtyFile: boolean;
  assistantBusy: boolean;
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
  hasDirtyFile,
  assistantBusy
}: TopToolbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-panel/90 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <ToolbarButton label="Open File" onClick={onOpenFile} />
        <ToolbarButton label="Open Project" onClick={onOpenProject} />
        <ToolbarButton label="Save" onClick={onSave} disabled={!hasDirtyFile} primary />
      </div>

      <div className="hidden items-center gap-2 md:flex">
        <ToolbarButton
          label={assistantBusy ? "Summarizing..." : "Summarize File"}
          onClick={onSummarizeFile}
          disabled={assistantBusy}
        />
        <ToolbarButton
          label={assistantBusy ? "Summarizing..." : "Summarize Project"}
          onClick={onSummarizeProject}
          disabled={assistantBusy}
        />
      </div>

      <div className="flex items-center gap-2">
        <ToolbarButton label="Settings" onClick={onOpenSettings} />
      </div>
    </header>
  );
}
