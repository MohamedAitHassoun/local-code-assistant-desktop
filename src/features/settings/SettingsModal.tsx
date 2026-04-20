import { useEffect, useMemo, useState } from "react";
import { formatBytes } from "@/lib/utils";
import type {
  AppSettings,
  OllamaModel,
  OllamaPullStreamEvent,
  OllamaStatus
} from "@/types";

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  models: OllamaModel[];
  ollamaStatus: OllamaStatus | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onRefreshModels: (endpoint: string) => Promise<void>;
  onSearchModels: (query: string) => Promise<string[]>;
  onPullModel: (
    endpoint: string,
    modelName: string,
    onProgress: (event: OllamaPullStreamEvent) => void
  ) => Promise<void>;
}

interface ModelCatalogOption {
  name: string;
  size?: number;
  installed: boolean;
}

export function SettingsModal({
  open,
  settings,
  models,
  ollamaStatus,
  onClose,
  onSave,
  onClearHistory,
  onRefreshModels,
  onSearchModels,
  onPullModel
}: SettingsModalProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  const [modelSearch, setModelSearch] = useState("");
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [customModelName, setCustomModelName] = useState("");
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState(false);
  const [downloadModelName, setDownloadModelName] = useState("");
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const installedModelOptions = useMemo(
    () => [...models].sort((a, b) => a.name.localeCompare(b.name)),
    [models]
  );

  const installedModelMap = useMemo(
    () => new Map(installedModelOptions.map((model) => [model.name, model])),
    [installedModelOptions]
  );

  const catalogOptions = useMemo((): ModelCatalogOption[] => {
    const query = modelSearch.trim().toLowerCase();
    const names: string[] = [];
    const seen = new Set<string>();

    for (const modelName of catalogModels) {
      const trimmed = modelName.trim();
      if (!trimmed) continue;
      if (query && !trimmed.toLowerCase().includes(query)) continue;
      if (seen.has(trimmed)) continue;
      names.push(trimmed);
      seen.add(trimmed);
    }

    for (const model of installedModelOptions) {
      if (query && !model.name.toLowerCase().includes(query)) continue;
      if (seen.has(model.name)) continue;
      names.push(model.name);
      seen.add(model.name);
    }

    return names.map((name) => {
      const installed = installedModelMap.get(name);
      return {
        name,
        size: installed?.size,
        installed: Boolean(installed)
      };
    });
  }, [catalogModels, installedModelMap, installedModelOptions, modelSearch]);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCustomModelName(settings.modelName);
  }, [open, settings.modelName]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchingCatalog(true);
      setCatalogError(null);
      try {
        const results = await onSearchModels(modelSearch.trim());
        if (active) {
          setCatalogModels(results);
        }
      } catch (error) {
        if (active) {
          const message =
            error instanceof Error ? error.message : "Failed to search models from registry.";
          setCatalogError(message);
          setCatalogModels([]);
        }
      } finally {
        if (active) {
          setSearchingCatalog(false);
        }
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [modelSearch, onSearchModels, open]);

  if (!open) {
    return null;
  }

  const updateForm = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const selectedModel = form.modelName.trim();
      const fallbackModel = installedModelOptions[0]?.name ?? settings.modelName;

      await onSave({
        ...form,
        modelName: selectedModel || fallbackModel
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const refreshInstalledModels = async () => {
    setRefreshingModels(true);
    setDownloadError(null);
    try {
      await onRefreshModels(form.ollamaEndpoint);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to refresh installed models.";
      setDownloadError(message);
    } finally {
      setRefreshingModels(false);
    }
  };

  const downloadModel = async (rawModelName: string) => {
    const modelName = rawModelName.trim();
    if (!modelName || downloadingModel) return;

    setDownloadingModel(true);
    setDownloadModelName(modelName);
    setDownloadStatus("Starting model download...");
    setDownloadPercent(null);
    setDownloadError(null);

    try {
      await onPullModel(form.ollamaEndpoint, modelName, (event) => {
        if (event.status) {
          setDownloadStatus(event.status);
        }

        if (typeof event.percent === "number" && Number.isFinite(event.percent)) {
          setDownloadPercent(Math.max(0, Math.min(100, event.percent)));
        } else if (event.done) {
          setDownloadPercent(100);
        }
      });

      setDownloadStatus("Model download completed.");
      setDownloadPercent(100);
      updateForm("modelName", modelName);
      setCustomModelName(modelName);
      await onRefreshModels(form.ollamaEndpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to download model.";
      setDownloadError(message);
      setDownloadStatus(null);
    } finally {
      setDownloadingModel(false);
    }
  };

  const selectedInstalledModelExists = installedModelOptions.some(
    (model) => model.name === form.modelName
  );
  const modelSelectValue = selectedInstalledModelExists ? form.modelName : "";

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
          <label className="text-sm text-ink">
            Model to use (installed only)
            <select
              value={modelSelectValue}
              onChange={(event) => updateForm("modelName", event.target.value)}
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
            >
              <option value="" disabled>
                {installedModelOptions.length > 0 ? "Select installed model" : "No installed models yet"}
              </option>
              {installedModelOptions.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-ink">
            Ollama endpoint
            <input
              value={form.ollamaEndpoint}
              onChange={(event) => updateForm("ollamaEndpoint", event.target.value)}
              className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
              placeholder="http://127.0.0.1:11434"
            />
          </label>

          <div className="rounded border border-border bg-slate-50 p-3 text-sm text-ink md:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Model manager</h3>
              <button
                type="button"
                onClick={() => void refreshInstalledModels()}
                disabled={refreshingModels || downloadingModel}
                className="rounded border border-border bg-white px-2 py-1 text-xs text-ink hover:bg-slate-100 disabled:opacity-60"
              >
                {refreshingModels ? "Refreshing..." : "Refresh installed"}
              </button>
            </div>

            <p className="mb-3 text-xs text-ink/70">
              Search the Ollama model registry, download models in-app, and use installed models
              directly.
            </p>

            {!ollamaStatus?.installed && (
              <div className="mb-3 rounded border border-warning/30 bg-amber-50 px-2 py-1.5 text-xs text-warning">
                Ollama is not installed. Install Ollama first, then download models here.
              </div>
            )}

            {ollamaStatus?.installed && !ollamaStatus.running && (
              <div className="mb-3 rounded border border-warning/30 bg-amber-50 px-2 py-1.5 text-xs text-warning">
                Ollama is installed but not running. The app will try to start it automatically
                before downloading.
              </div>
            )}

            <div className="mb-2 flex gap-2">
              <input
                value={customModelName}
                onChange={(event) => setCustomModelName(event.target.value)}
                className="w-full rounded border border-border bg-white px-3 py-2 text-sm"
                placeholder="Model name (example: qwen2.5-coder:7b)"
              />
              <button
                type="button"
                onClick={() => void downloadModel(customModelName)}
                disabled={!customModelName.trim() || downloadingModel}
                className="rounded border border-success bg-success px-3 py-2 text-xs text-white hover:brightness-95 disabled:opacity-60"
              >
                {downloadingModel && downloadModelName === customModelName.trim()
                  ? "Downloading..."
                  : "Download"}
              </button>
            </div>

            <input
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              className="mb-2 w-full rounded border border-border bg-white px-3 py-2 text-sm"
              placeholder="Search Ollama models..."
            />

            <div className="mb-2 flex items-center gap-2 text-[11px] text-ink/60">
              {searchingCatalog ? <span>Searching registry...</span> : <span>Registry search ready.</span>}
              {catalogError && <span className="text-danger">{catalogError}</span>}
            </div>

            <div className="max-h-52 space-y-1 overflow-auto rounded border border-border bg-white p-2">
              {catalogOptions.length === 0 ? (
                <p className="text-xs text-ink/60">No models found for this search.</p>
              ) : (
                catalogOptions.map((option) => (
                  <div
                    key={option.name}
                    className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink">{option.name}</p>
                      <div className="flex items-center gap-1 text-[11px] text-ink/60">
                        {option.installed && (
                          <span className="rounded border border-success/30 bg-green-50 px-1 text-success">
                            Installed
                          </span>
                        )}
                        {typeof option.size === "number" && <span>{formatBytes(option.size)}</span>}
                      </div>
                    </div>

                    {option.installed ? (
                      <button
                        type="button"
                        onClick={() => updateForm("modelName", option.name)}
                        className="rounded border border-border bg-white px-2 py-1 text-xs text-ink hover:bg-slate-100"
                      >
                        Use
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void downloadModel(option.name)}
                        disabled={downloadingModel}
                        className="rounded border border-success bg-success px-2 py-1 text-xs text-white hover:brightness-95 disabled:opacity-60"
                      >
                        {downloadingModel && downloadModelName === option.name
                          ? "Downloading..."
                          : "Download"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {(downloadStatus || downloadError) && (
              <div className="mt-2 rounded border border-border bg-white p-2 text-xs">
                {downloadStatus && (
                  <p className="text-ink">
                    {downloadModelName ? `${downloadModelName}: ` : ""}
                    {downloadStatus}
                  </p>
                )}
                {typeof downloadPercent === "number" && (
                  <div className="mt-1">
                    <div className="h-2 overflow-hidden rounded bg-slate-200">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${Math.round(downloadPercent)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-ink/60">{Math.round(downloadPercent)}%</p>
                  </div>
                )}
                {downloadError && <p className="mt-1 text-danger">{downloadError}</p>}
              </div>
            )}
          </div>

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
