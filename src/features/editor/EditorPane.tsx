import { useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { cn } from "@/lib/utils";
import type { EditorTab, SelectionRange } from "@/types";

export type EditorAction = "explain" | "fix" | "refactor" | "tests" | "chat";

interface EditorPaneProps {
  tabs: EditorTab[];
  activePath: string | null;
  theme: "light" | "dark";
  onSetActiveTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
  onSelectionChange: (selection: SelectionRange | null) => void;
  onAction: (action: EditorAction) => void;
}

function ActionButton({
  label,
  onClick,
  disabled
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-border bg-white px-2 py-1 text-xs text-ink hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function EditorPane({
  tabs,
  activePath,
  theme,
  onSetActiveTab,
  onCloseTab,
  onContentChange,
  onSelectionChange,
  onAction
}: EditorPaneProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    editor.onDidChangeCursorSelection((event) => {
      const model = editor.getModel();
      if (!model) {
        onSelectionChange(null);
        return;
      }

      const selection = event.selection;
      const selectedText = model.getValueInRange(selection);
      if (!selectedText.trim()) {
        onSelectionChange(null);
        return;
      }

      onSelectionChange({
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn,
        text: selectedText
      });
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <div className="border-b border-border bg-white">
        <div className="flex h-10 items-center gap-1 overflow-x-auto px-2">
          {tabs.length === 0 ? (
            <span className="px-2 text-xs text-ink/50">No open files</span>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.path}
                className={cn(
                  "flex items-center gap-2 rounded-t-md border border-transparent px-3 py-1 text-sm",
                  tab.path === activePath
                    ? "border-border bg-slate-100 text-ink"
                    : "text-ink/70 hover:bg-slate-50"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSetActiveTab(tab.path)}
                  className="max-w-[180px] truncate"
                  title={tab.path}
                >
                  {tab.name}
                  {tab.dirty ? " *" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTab(tab.path)}
                  className="rounded px-1 text-xs text-ink/60 hover:bg-slate-200"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-2 py-2">
          <ActionButton
            label="Explain selection"
            onClick={() => onAction("explain")}
            disabled={!activeTab}
          />
          <ActionButton label="Fix selection" onClick={() => onAction("fix")} disabled={!activeTab} />
          <ActionButton
            label="Refactor selection"
            onClick={() => onAction("refactor")}
            disabled={!activeTab}
          />
          <ActionButton
            label="Generate tests"
            onClick={() => onAction("tests")}
            disabled={!activeTab}
          />
          <ActionButton
            label="Ask AI about this code"
            onClick={() => onAction("chat")}
            disabled={!activeTab}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab ? (
          <Editor
            key={activeTab.path}
            path={activeTab.path}
            language={activeTab.language}
            value={activeTab.content}
            onMount={handleEditorMount}
            onChange={(value) => onContentChange(activeTab.path, value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              quickSuggestions: true,
              formatOnType: true,
              formatOnPaste: true,
              contextmenu: true
            }}
            theme={theme === "dark" ? "vs-dark" : "vs"}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-ink/60">
            Open a file to start coding with AI.
          </div>
        )}
      </div>
    </section>
  );
}
