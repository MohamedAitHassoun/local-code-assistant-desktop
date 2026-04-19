import type { SuggestedCommand } from "@/types";

interface CommandReviewPanelProps {
  command: SuggestedCommand;
  projectRoot: string;
  running: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function CommandReviewPanel({
  command,
  projectRoot,
  running,
  onApprove,
  onReject
}: CommandReviewPanelProps) {
  return (
    <div className="fixed inset-x-8 bottom-10 top-24 z-40 rounded-xl border border-border bg-panel shadow-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Review command suggestion</h3>
          <p className="text-xs text-ink/60">{command.reason}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={running}
            className="rounded border border-border bg-white px-3 py-1 text-sm text-ink hover:bg-slate-100 disabled:opacity-60"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={running}
            className="rounded border border-warning/40 bg-amber-50 px-3 py-1 text-sm text-warning hover:bg-amber-100 disabled:opacity-60"
          >
            {running ? "Running..." : "Approve & Run"}
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/60">Working directory</p>
          <code className="block rounded border border-border bg-slate-50 px-3 py-2 text-xs text-ink">
            {projectRoot}
          </code>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/60">Command</p>
          <pre className="max-h-56 overflow-auto rounded border border-border bg-slate-50 px-3 py-2 text-sm text-ink">
            {command.command}
          </pre>
        </div>

        <p className="text-xs text-ink/60">
          This command will never run automatically. It only runs after your explicit approval.
        </p>
      </div>
    </div>
  );
}
