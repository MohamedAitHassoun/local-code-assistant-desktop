import { useEffect, useMemo, useState } from "react";
import type { SuggestedFileOperation, SuggestedFilePlan } from "@/types";

interface FilePlanReviewPanelProps {
  plan: SuggestedFilePlan;
  applying: boolean;
  onAccept: () => void;
  onReject: () => void;
}

function operationBadgeClass(action: SuggestedFileOperation["action"]): string {
  if (action === "create") return "border-success/40 bg-green-50 text-success";
  if (action === "delete") return "border-danger/40 bg-red-50 text-danger";
  return "border-warning/40 bg-amber-50 text-warning";
}

export function FilePlanReviewPanel({
  plan,
  applying,
  onAccept,
  onReject
}: FilePlanReviewPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [plan.id]);

  const selectedOperation = useMemo(
    () => plan.operations[selectedIndex] ?? null,
    [plan.operations, selectedIndex]
  );

  return (
    <div className="fixed inset-x-6 bottom-6 top-16 z-40 rounded-xl border border-border bg-panel shadow-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Review file change plan</h3>
          <p className="text-xs text-ink/60">
            {plan.reason} · {plan.operations.length} operation{plan.operations.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={applying}
            className="rounded border border-border bg-white px-3 py-1 text-sm text-ink hover:bg-slate-100 disabled:opacity-60"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={applying}
            className="rounded border border-success bg-success px-3 py-1 text-sm text-white hover:brightness-95 disabled:opacity-60"
          >
            {applying ? "Applying..." : "Accept & Apply All"}
          </button>
        </div>
      </div>

      <div className="grid h-[calc(100%-57px)] grid-cols-[320px,1fr]">
        <aside className="border-r border-border bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">
            Proposed operations
          </p>
          <div className="space-y-2 overflow-auto">
            {plan.operations.map((operation, index) => (
              <button
                key={`${operation.action}-${operation.relativePath}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`w-full rounded border px-2 py-2 text-left ${
                  selectedIndex === index
                    ? "border-accent bg-white"
                    : "border-border bg-white hover:border-accent/40"
                }`}
              >
                <span
                  className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase ${operationBadgeClass(operation.action)}`}
                >
                  {operation.action}
                </span>
                <p className="mt-1 break-all text-xs text-ink">{operation.relativePath}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 p-3">
          {selectedOperation ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="rounded border border-border bg-slate-50 px-3 py-2 text-xs text-ink/80">
                <span className="font-semibold uppercase">{selectedOperation.action}</span>
                <span className="mx-2">•</span>
                <span className="break-all">{selectedOperation.relativePath}</span>
              </div>

              {selectedOperation.action === "update" && (
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                  <div className="min-h-0 rounded border border-border bg-white">
                    <p className="border-b border-border px-3 py-1 text-xs font-semibold uppercase text-ink/60">
                      Current content
                    </p>
                    <pre className="h-full overflow-auto p-3 text-xs text-ink whitespace-pre-wrap">
                      {selectedOperation.originalContent ?? "(Unable to preview current content.)"}
                    </pre>
                  </div>
                  <div className="min-h-0 rounded border border-border bg-white">
                    <p className="border-b border-border px-3 py-1 text-xs font-semibold uppercase text-ink/60">
                      Proposed content
                    </p>
                    <pre className="h-full overflow-auto p-3 text-xs text-ink whitespace-pre-wrap">
                      {selectedOperation.proposedContent ?? ""}
                    </pre>
                  </div>
                </div>
              )}

              {selectedOperation.action === "create" && (
                <div className="min-h-0 flex-1 rounded border border-border bg-white">
                  <p className="border-b border-border px-3 py-1 text-xs font-semibold uppercase text-ink/60">
                    New file content
                  </p>
                  <pre className="h-full overflow-auto p-3 text-xs text-ink whitespace-pre-wrap">
                    {selectedOperation.proposedContent ?? ""}
                  </pre>
                </div>
              )}

              {selectedOperation.action === "delete" && (
                <div className="min-h-0 flex-1 rounded border border-border bg-white">
                  <p className="border-b border-border px-3 py-1 text-xs font-semibold uppercase text-ink/60">
                    Content to remove
                  </p>
                  <pre className="h-full overflow-auto p-3 text-xs text-ink whitespace-pre-wrap">
                    {selectedOperation.originalContent ?? "(Unable to preview current content.)"}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink/60">
              No file operations to review.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
