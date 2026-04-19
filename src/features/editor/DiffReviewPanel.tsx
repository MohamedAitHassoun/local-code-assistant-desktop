import { DiffEditor } from "@monaco-editor/react";
import type { SuggestedEdit } from "@/types";

interface DiffReviewPanelProps {
  edit: SuggestedEdit;
  theme: "light" | "dark";
  language: string;
  onAccept: () => void;
  onReject: () => void;
}

export function DiffReviewPanel({ edit, theme, language, onAccept, onReject }: DiffReviewPanelProps) {
  return (
    <div className="fixed inset-x-8 bottom-6 top-20 z-40 rounded-xl border border-border bg-panel shadow-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Review AI suggestion</h3>
          <p className="text-xs text-ink/60">{edit.reason} · {edit.filePath}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReject}
            className="rounded border border-border bg-white px-3 py-1 text-sm text-ink hover:bg-slate-100"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded border border-success bg-success px-3 py-1 text-sm text-white hover:brightness-95"
          >
            Accept & Apply
          </button>
        </div>
      </div>

      <div className="h-[calc(100%-53px)]">
        <DiffEditor
          original={edit.originalContent}
          modified={edit.proposedContent}
          language={language}
          options={{
            renderSideBySide: true,
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            automaticLayout: true,
            ignoreTrimWhitespace: false
          }}
          theme={theme === "dark" ? "vs-dark" : "vs"}
        />
      </div>
    </div>
  );
}
