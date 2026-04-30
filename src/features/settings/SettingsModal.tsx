import { useEffect, useState } from "react";
import {
  normalizeLockedAiSettings
} from "@/lib/constants";
import type { AppSettings } from "@/types";

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onClearHistory: () => Promise<void>;
}

export function SettingsModal({
  open,
  settings,
  onClose,
  onSave,
  onClearHistory
}: SettingsModalProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!open) {
    return null;
  }

  const updateForm = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const nextSettings = normalizeLockedAiSettings({
        ...form,
        workingOnlyMode: true,
        commandExecutionEnabled: form.fullAccessMode ? true : form.commandExecutionEnabled,
        allowAnyCommand: form.fullAccessMode ? true : form.allowAnyCommand
      });

      await onSave(nextSettings);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-panel p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-white px-3 py-1 text-sm text-ink hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.agenticMode}
              onChange={(event) => updateForm("agenticMode", event.target.checked)}
            />
            Agentic mode (detect build requests and generate executable project file plans)
          </label>

          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.autoApplyFilePlans}
              onChange={(event) => updateForm("autoApplyFilePlans", event.target.checked)}
              disabled={!form.agenticMode}
            />
            Auto-apply AI file plans for chat build requests (use with caution)
          </label>

          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.autoApproveActions}
              onChange={(event) => updateForm("autoApproveActions", event.target.checked)}
            />
            Auto-approve AI suggestions (commands, edits, and file plans)
          </label>

          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.autonomousAgentEnabled}
              onChange={(event) => updateForm("autonomousAgentEnabled", event.target.checked)}
            />
            Autonomous agent mode (AI can inspect files, run commands, and continue steps
            automatically)
          </label>

          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.fullAccessMode}
              onChange={(event) => updateForm("fullAccessMode", event.target.checked)}
            />
            Full access mode (remove command safety limits and allow unrestricted step execution)
          </label>

          <label className="text-sm text-ink">
            Autonomous max steps
            <input
              type="number"
              min={2}
              max={20}
              value={form.maxAgentSteps}
              onChange={(event) => updateForm("maxAgentSteps", Number(event.target.value))}
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
            />
          </label>

          <label className="text-sm text-ink">
            Temperature
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(event) => updateForm("temperature", Number(event.target.value))}
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
            />
          </label>

          <label className="text-sm text-ink">
            Max tokens
            <input
              type="number"
              min={128}
              max={8192}
              step={128}
              value={form.maxTokens}
              onChange={(event) => updateForm("maxTokens", Number(event.target.value))}
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
            />
          </label>

          <label className="text-sm text-ink">
            Context mode
            <select
              value={form.contextMode}
              onChange={(event) =>
                updateForm("contextMode", event.target.value as AppSettings["contextMode"])
              }
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
            >
              <option value="focused">Focused</option>
              <option value="balanced">Balanced</option>
              <option value="wide">Wide</option>
            </select>
          </label>

          <label className="text-sm text-ink">
            Theme
            <select
              value={form.theme}
              onChange={(event) => updateForm("theme", event.target.value as AppSettings["theme"])}
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <label className="text-sm text-ink md:col-span-2">
            Max files in context
            <input
              type="number"
              min={1}
              max={25}
              value={form.maxFilesInContext}
              onChange={(event) => updateForm("maxFilesInContext", Number(event.target.value))}
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
            />
          </label>

          <label className="text-sm text-ink md:col-span-2">
            Default ignored folders (comma separated)
            <input
              value={form.ignoredFolders.join(",")}
              onChange={(event) =>
                updateForm(
                  "ignoredFolders",
                  event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                )
              }
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
              placeholder="node_modules,.git,dist,build,.venv"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.includeCurrentFile}
              onChange={(event) => updateForm("includeCurrentFile", event.target.checked)}
            />
            Include current file automatically
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.includeSelection}
              onChange={(event) => updateForm("includeSelection", event.target.checked)}
            />
            Include selected text automatically
          </label>

          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.commandExecutionEnabled}
              onChange={(event) => updateForm("commandExecutionEnabled", event.target.checked)}
            />
            Enable command execution (always requires manual approval)
          </label>

          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.allowAnyCommand}
              onChange={(event) => updateForm("allowAnyCommand", event.target.checked)}
              disabled={!form.commandExecutionEnabled}
            />
            Allow any command after manual approval (dangerous)
          </label>

          <label className="text-sm text-ink md:col-span-2">
            Allowed command prefixes (comma separated)
            <input
              value={form.allowedCommandPrefixes.join(",")}
              onChange={(event) =>
                updateForm(
                  "allowedCommandPrefixes",
                  event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                )
              }
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
              placeholder="npm run,pytest,cargo test"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void onClearHistory()}
            className="rounded border border-danger/40 bg-red-50 px-3 py-1.5 text-sm text-danger hover:bg-red-100"
          >
            Clear history
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded border border-accent bg-accent px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
