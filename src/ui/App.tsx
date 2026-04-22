import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { CommandReviewPanel } from "@/features/editor/CommandReviewPanel";
import { DiffReviewPanel } from "@/features/editor/DiffReviewPanel";
import { FilePlanReviewPanel } from "@/features/editor/FilePlanReviewPanel";
import { EditorPane, type EditorAction } from "@/features/editor/EditorPane";
import { ProjectExplorer } from "@/features/projects/ProjectExplorer";
import { SettingsModal } from "@/features/settings/SettingsModal";
import { basename, buildTimestamp, dirname, normalizePath } from "@/lib/utils";
import { applyFileOperations, readTextFile, saveTextFile, scanProject } from "@/services/fileSystem";
import {
  checkOllamaStatus,
  installOllama,
  listOllamaModels,
  searchOllamaModels,
  startOllama,
  streamOllamaPull
} from "@/services/ollama/client";
import { runProjectCommand } from "@/services/terminal/commands";
import {
  addRecentProject,
  appendChatMessage,
  clearChatHistory,
  loadChatHistory,
  loadRecentProjects,
  loadSettings,
  saveSettings
} from "@/services/storage/commands";
import { useAssistant } from "@/hooks/useAssistant";
import { useChatStore } from "@/stores/chatStore";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TopToolbar } from "./layout/TopToolbar";
import type {
  ChatMessage,
  OllamaModel,
  OllamaPullStreamEvent,
  OllamaStatus,
  RecentProject
} from "@/types";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [appError, setAppError] = useState<string | null>(null);
  const [runningCommand, setRunningCommand] = useState(false);
  const [applyingFilePlan, setApplyingFilePlan] = useState(false);
  const autoAppliedPlanIdsRef = useRef<Set<string>>(new Set());

  const settings = useSettingsStore((state) => state.settings);
  const replaceSettings = useSettingsStore((state) => state.replaceSettings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const { messages, loading, error, setMessages, appendMessage, clear } = useChatStore();

  const {
    rootPath,
    tree,
    files,
    skippedEntries,
    selectedContextFiles,
    setProject,
    setIsScanning,
    isScanning,
    toggleContextFile,
    setProjectSummary
  } = useProjectStore();

  const {
    tabs,
    activePath,
    selection,
    pendingEdit,
    pendingCommand,
    pendingFilePlan,
    openTab,
    closeTab,
    updateContent,
    markSaved,
    setActivePath,
    setSelection,
    setPendingEdit,
    setPendingCommand,
    setPendingFilePlan,
    applyPendingEdit
  } = useEditorStore();

  const { sendAssistantPrompt } = useAssistant();

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.path === activePath) ?? null,
    [activePath, tabs]
  );

  const computeAllowedRoot = (path: string): string => {
    if (!rootPath) {
      return dirname(path);
    }

    const normalizedPath = path.replace(/\\/g, "/");
    const normalizedRoot = rootPath.replace(/\\/g, "/");
    const withinProject =
      normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);

    return withinProject ? rootPath : dirname(path);
  };

  const resolveProjectFilePath = (relativePath: string): string | null => {
    if (!rootPath) {
      return null;
    }

    const cleanedRelative = normalizePath(relativePath)
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "")
      .trim();
    const normalizedRoot = normalizePath(rootPath).replace(/\/+$/, "");
    return `${normalizedRoot}/${cleanedRelative}`.replace(/\/{2,}/g, "/");
  };

  const extractErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    if (error && typeof error === "object") {
      const withMessage = error as { message?: unknown; error?: unknown };
      if (typeof withMessage.message === "string") {
        return withMessage.message;
      }
      if (typeof withMessage.error === "string") {
        return withMessage.error;
      }
    }

    return fallback;
  };

  const refreshOllama = async (endpoint: string) => {
    try {
      const status = await checkOllamaStatus(endpoint);
      setOllamaStatus(status);
      setAppError(null);

      if (status.running) {
        const list = await listOllamaModels(endpoint);
        setModels(list);
      } else {
        setModels([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check Ollama status.";
      setAppError(message);
    }
  };

  const reloadRecentProjects = async () => {
    try {
      const recents = await loadRecentProjects();
      setRecentProjects(recents);
    } catch {
      // Non-blocking.
    }
  };

  useEffect(() => {
    const initialize = async () => {
      let endpoint = settings.ollamaEndpoint;
      try {
        const loaded = await loadSettings();
        const normalizedLoaded = { ...loaded };
        replaceSettings(normalizedLoaded);
        endpoint = loaded.ollamaEndpoint;
      } catch {
        // Use defaults if this is first app run.
      }

      await reloadRecentProjects();
      await refreshOllama(endpoint);

      try {
        const history = await loadChatHistory();
        setMessages(history);
      } catch {
        // Non-blocking for first boot.
      }
    };

    void initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  useEffect(() => {
    void refreshOllama(settings.ollamaEndpoint);
  }, [settings.ollamaEndpoint]);

  useEffect(() => {
    const loadProjectHistory = async () => {
      try {
        const history = await loadChatHistory(rootPath ?? undefined);
        setMessages(history);
      } catch {
        // Keep existing history if loading fails.
      }
    };

    void loadProjectHistory();
  }, [rootPath, setMessages]);

  const openFilePath = async (path: string, allowedRoot?: string) => {
    try {
      const file = await readTextFile(path, allowedRoot);
      openTab(file.path, file.language, file.content);
      setAppError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open file.";
      setAppError(message);
    }
  };

  const handleOpenFileDialog = async () => {
    const selected = await open({
      title: "Open file",
      directory: false,
      multiple: false
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    await openFilePath(selected);
  };

  const openProjectPath = async (path: string) => {
    setIsScanning(true);
    try {
      const result = await scanProject(path, settings.ignoredFolders);
      setProject(result);
      await addRecentProject(path);
      await reloadRecentProjects();
      setAppError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to scan project.";
      setAppError(message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleOpenProjectDialog = async () => {
    const selected = await open({
      title: "Open project",
      directory: true,
      multiple: false
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    await openProjectPath(selected);
  };

  const handleSaveActive = async () => {
    if (!activeTab) {
      return;
    }

    try {
      const allowedRoot = computeAllowedRoot(activeTab.path);
      await saveTextFile(activeTab.path, activeTab.content, allowedRoot);
      markSaved(activeTab.path, activeTab.content);
      setAppError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save file.";
      setAppError(message);
    }
  };

  const promptFromAction = (action: EditorAction): { intent: Parameters<typeof sendAssistantPrompt>[0]["intent"]; prompt: string } => {
    const selected = selection?.text?.trim();

    switch (action) {
      case "explain":
        return {
          intent: "explain",
          prompt: selected ? "Explain this selected code in detail." : "Explain the current file."
        };
      case "fix":
        return {
          intent: "fix",
          prompt: selected
            ? "Fix this selected code and preserve intended behavior."
            : "Fix issues in this file and return corrected code."
        };
      case "refactor":
        return {
          intent: "refactor",
          prompt: selected
            ? "Refactor this selected code for readability and maintainability."
            : "Refactor this file while keeping behavior unchanged."
        };
      case "tests":
        return {
          intent: "tests",
          prompt: selected
            ? "Generate unit tests for this selected code."
            : "Generate unit tests for this file."
        };
      case "chat":
      default:
        return {
          intent: "chat",
          prompt: selected
            ? `Answer questions about this selected code:\n\n${selected}`
            : "Analyze this file and explain notable parts."
        };
    }
  };

  const handleEditorAction = async (action: EditorAction) => {
    if (!activeTab) return;

    const promptConfig = promptFromAction(action);
    try {
      await sendAssistantPrompt(promptConfig);
    } catch {
      // Error already surfaced by chat store.
    }
  };

  const handleSummarizeFile = async () => {
    if (!activeTab) {
      setAppError("Open a file first to summarize it.");
      return;
    }

    try {
      await sendAssistantPrompt({
        intent: "file_summary",
        prompt: `Summarize the file: ${basename(activeTab.path)}`
      });
      setAppError(null);
    } catch {
      // Managed by chat store.
    }
  };

  const handleSummarizeProject = async () => {
    if (!rootPath && files.length === 0) {
      setAppError("Open a project folder first.");
      return;
    }

    try {
      const summary = await sendAssistantPrompt({
        intent: "project_summary",
        prompt: "Summarize this project for a new engineer joining today."
      });
      setProjectSummary(summary);
      setAppError(null);
    } catch {
      // Managed by chat store.
    }
  };

  const onboardingMessage = useMemo(() => {
    if (!ollamaStatus) {
      return null;
    }

    if (!ollamaStatus.installed) {
      return "Install Ollama from https://ollama.com/download. Then use Settings -> Model Manager to download models directly in the app.";
    }

    if (!ollamaStatus.running) {
      return "Start Ollama and ensure the endpoint is reachable (default http://127.0.0.1:11434).";
    }

    return null;
  }, [ollamaStatus]);

  const handleClearHistory = async () => {
    await clearChatHistory(rootPath ?? undefined);
    clear();
  };

  const handleSendChat = async (prompt: string) => {
    await sendAssistantPrompt({ intent: "chat", prompt });
  };

  const handleInstallOllama = async () => {
    try {
      await installOllama();
      await refreshOllama(settings.ollamaEndpoint);
      setAppError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open Ollama installer.";
      setAppError(message);
    }
  };

  const handleStartOllama = async () => {
    try {
      await startOllama(settings.ollamaEndpoint);
      await refreshOllama(settings.ollamaEndpoint);
      setAppError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start Ollama.";
      setAppError(message);
    }
  };

  const handleRefreshOllama = async () => {
    await refreshOllama(settings.ollamaEndpoint);
  };

  const handleRefreshModels = async (endpoint: string) => {
    await refreshOllama(endpoint);
  };

  const handleSearchModels = useCallback(async (query: string) => {
    return searchOllamaModels(query, 120);
  }, []);

  const handlePullModel = async (
    endpoint: string,
    modelName: string,
    onProgress: (event: OllamaPullStreamEvent) => void
  ) => {
    const status = await checkOllamaStatus(endpoint);
    if (!status.installed) {
      throw new Error("Ollama is not installed. Install it first, then download models.");
    }

    if (!status.running) {
      await startOllama(endpoint);
    }

    await streamOllamaPull(endpoint, modelName, onProgress);
    await refreshOllama(endpoint);
  };

  const handleSaveSettings = async (nextSettings: typeof settings) => {
    const normalizedSettings = {
      ...nextSettings,
      workingOnlyMode: true
    };

    await saveSettings(normalizedSettings);
    updateSettings(normalizedSettings);
    await refreshOllama(normalizedSettings.ollamaEndpoint);
  };

  const persistSettingsPatch = (patch: Partial<typeof settings>) => {
    const next = {
      ...settings,
      ...patch,
      workingOnlyMode: true
    };
    updateSettings(next);
    void saveSettings(next);
  };

  const handleToggleAutoApprove = () => {
    persistSettingsPatch({ autoApproveActions: !settings.autoApproveActions });
  };

  const activeModelLabel = useMemo(() => {
    const customLabel = settings.displayModelLabel.trim();
    if (customLabel) {
      return customLabel;
    }

    return settings.modelName;
  }, [settings.displayModelLabel, settings.modelName]);

  const persistLocalMessage = (message: ChatMessage) => {
    appendMessage(message);
    void appendChatMessage(message);
  };

  const handleApproveCommand = async () => {
    if (!pendingCommand) {
      return;
    }

    if (!rootPath) {
      setAppError("Open a project folder before running commands.");
      setPendingCommand(null);
      return;
    }

    const command = pendingCommand;
    setRunningCommand(true);

    const commandStartMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content: `Running approved command:\n\`\`\`bash\n${command.command}\n\`\`\`\nDirectory: ${rootPath}`,
      createdAt: buildTimestamp(),
      projectPath: rootPath,
      metadata: { intent: "run_command" }
    };
    persistLocalMessage(commandStartMessage);

    try {
      const result = await runProjectCommand({
        command: command.command,
        projectRoot: rootPath,
        allowedPrefixes: settings.allowedCommandPrefixes,
        timeoutSeconds: 120
      });

      const outputSections = [
        `Command finished${result.timedOut ? " (timed out)." : "."}`,
        `Exit code: ${result.exitCode ?? "none"}`,
        `Directory: ${result.cwd}`,
        result.stdout ? `\nStdout:\n\`\`\`\n${result.stdout}\n\`\`\`` : "",
        result.stderr ? `\nStderr:\n\`\`\`\n${result.stderr}\n\`\`\`` : ""
      ]
        .filter(Boolean)
        .join("\n");

      const outputMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: outputSections,
        createdAt: buildTimestamp(),
        projectPath: rootPath,
        metadata: { intent: "run_command" }
      };
      persistLocalMessage(outputMessage);
      setAppError(null);
    } catch (err) {
      const message = extractErrorMessage(err, "Failed to run command.");
      setAppError(message);

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Command execution failed: ${message}`,
        createdAt: buildTimestamp(),
        projectPath: rootPath,
        metadata: { intent: "run_command" }
      };
      persistLocalMessage(errorMessage);
    } finally {
      setRunningCommand(false);
      setPendingCommand(null);
    }
  };

  const handleApproveFilePlan = async () => {
    if (!pendingFilePlan) {
      return;
    }

    if (!rootPath) {
      setAppError("Open a project folder before applying multi-file changes.");
      setPendingFilePlan(null);
      return;
    }

    const plan = pendingFilePlan;
    const compactWorkingLog = Boolean(plan.autoApply);
    setApplyingFilePlan(true);

    const commandStartMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content: compactWorkingLog
        ? "Applying generated changes..."
        : `Applying approved file plan (${plan.operations.length} operation${
            plan.operations.length === 1 ? "" : "s"
          }):\n${plan.operations
            .map((operation, index) => `${index + 1}. ${operation.action.toUpperCase()} ${operation.relativePath}`)
            .join("\n")}`,
      createdAt: buildTimestamp(),
      projectPath: rootPath,
      metadata: { intent: "apply_file_plan" }
    };
    persistLocalMessage(commandStartMessage);

    try {
      const operationsForApply = plan.operations.map((operation) => {
        if ((operation.action === "create" || operation.action === "update") && typeof operation.proposedContent !== "string") {
          throw new Error(`Operation ${operation.action} for ${operation.relativePath} is missing content.`);
        }

        return {
          relativePath: operation.relativePath,
          action: operation.action,
          content: operation.action === "delete" ? undefined : operation.proposedContent
        };
      });

      const appliedPaths = await applyFileOperations(rootPath, operationsForApply);

      for (const operation of plan.operations) {
        const resolvedPath = resolveProjectFilePath(operation.relativePath);
        if (!resolvedPath) continue;

        const matchingTab = tabs.find(
          (tab) => normalizePath(tab.path) === normalizePath(resolvedPath)
        );
        if (!matchingTab) continue;

        if (operation.action === "delete") {
          closeTab(matchingTab.path);
          continue;
        }

        const nextContent = operation.proposedContent ?? "";
        updateContent(matchingTab.path, nextContent);
        markSaved(matchingTab.path, nextContent);
      }

      setIsScanning(true);
      try {
        const refreshed = await scanProject(rootPath, settings.ignoredFolders);
        setProject(refreshed);
      } finally {
        setIsScanning(false);
      }

      const outputMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: compactWorkingLog
          ? appliedPaths.length > 0
            ? `Done. Applied ${appliedPaths.length} change${
                appliedPaths.length === 1 ? "" : "s"
              }.`
            : "Done. No file changes were applied."
          : appliedPaths.length > 0
            ? `Applied file changes:\n${appliedPaths
                .map((path, index) => `${index + 1}. ${path}`)
                .join("\n")}`
            : "No file changes were applied.",
        createdAt: buildTimestamp(),
        projectPath: rootPath,
        metadata: { intent: "apply_file_plan" }
      };
      persistLocalMessage(outputMessage);
      setAppError(null);
    } catch (err) {
      const message = extractErrorMessage(err, "Failed to apply file plan.");
      setAppError(message);

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `File plan apply failed: ${message}`,
        createdAt: buildTimestamp(),
        projectPath: rootPath,
        metadata: { intent: "apply_file_plan" }
      };
      persistLocalMessage(errorMessage);
    } finally {
      setApplyingFilePlan(false);
      setPendingFilePlan(null);
      setIsScanning(false);
    }
  };

  const handleAcceptEdit = async () => {
    if (!pendingEdit) {
      return;
    }

    const edit = pendingEdit;
    applyPendingEdit();

    try {
      await saveTextFile(edit.filePath, edit.proposedContent, computeAllowedRoot(edit.filePath));
      markSaved(edit.filePath, edit.proposedContent);
      setAppError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply suggested edit.";
      setAppError(message);
    } finally {
      setPendingEdit(null);
    }
  };

  useEffect(() => {
    if (!pendingFilePlan) {
      return;
    }

    if (!(pendingFilePlan.autoApply || settings.autoApproveActions)) {
      return;
    }

    if (applyingFilePlan) {
      return;
    }

    if (autoAppliedPlanIdsRef.current.has(pendingFilePlan.id)) {
      return;
    }

    autoAppliedPlanIdsRef.current.add(pendingFilePlan.id);

    const autoApplyMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content:
        pendingFilePlan.autoApply
          ? "Thinking complete. Applying changes..."
          : `Auto-applying generated file plan (${pendingFilePlan.operations.length} operation${
              pendingFilePlan.operations.length === 1 ? "" : "s"
            })...`,
      createdAt: buildTimestamp(),
      projectPath: rootPath ?? undefined,
      metadata: { intent: "apply_file_plan" }
    };
    persistLocalMessage(autoApplyMessage);

    void handleApproveFilePlan();
  }, [applyingFilePlan, pendingFilePlan, rootPath, settings.autoApproveActions]);

  useEffect(() => {
    if (!settings.autoApproveActions || !pendingCommand || runningCommand) {
      return;
    }

    void handleApproveCommand();
  }, [pendingCommand, runningCommand, settings.autoApproveActions]);

  useEffect(() => {
    if (!pendingEdit || pendingFilePlan) {
      return;
    }

    if (!(settings.autoApproveActions || pendingEdit.autoApply)) {
      return;
    }

    void handleAcceptEdit();
  }, [pendingEdit, pendingFilePlan, settings.autoApproveActions]);

  return (
    <div className="flex h-full flex-col text-ink">
      <TopToolbar
        onOpenFile={() => void handleOpenFileDialog()}
        onOpenProject={() => void handleOpenProjectDialog()}
        onSave={() => void handleSaveActive()}
        onSummarizeFile={() => void handleSummarizeFile()}
        onSummarizeProject={() => void handleSummarizeProject()}
        onOpenSettings={() => setSettingsOpen(true)}
        activeModel={activeModelLabel}
        hasDirtyFile={Boolean(activeTab?.dirty)}
        ollamaStatus={ollamaStatus}
      />

      {(appError || isScanning) && (
        <div className="border-b border-border bg-slate-100 px-4 py-2 text-xs text-ink/80">
          {isScanning ? "Scanning project files..." : appError}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <PanelGroup direction="horizontal" autoSaveId="main-layout">
          <Panel defaultSize={18} minSize={12}>
            <ProjectExplorer
              tree={tree}
              rootPath={rootPath}
              selectedContextFiles={selectedContextFiles}
              skippedEntries={skippedEntries}
              recentProjects={recentProjects}
              onOpenFile={(path) => void openFilePath(path, rootPath ?? undefined)}
              onToggleContextFile={toggleContextFile}
              onOpenRecentProject={(path) => void openProjectPath(path)}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border/60 transition-colors hover:bg-accent/40" />

          <Panel defaultSize={54} minSize={28}>
            <EditorPane
              tabs={tabs}
              activePath={activePath}
              theme={settings.theme}
              onSetActiveTab={setActivePath}
              onCloseTab={closeTab}
              onContentChange={updateContent}
              onSelectionChange={setSelection}
              onAction={(action) => void handleEditorAction(action)}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border/60 transition-colors hover:bg-accent/40" />

          <Panel defaultSize={28} minSize={18}>
            <ChatPanel
              messages={messages}
              loading={loading}
              error={error}
              onboardingMessage={onboardingMessage}
              ollamaStatus={ollamaStatus}
              autoApproveEnabled={settings.autoApproveActions}
              onSend={handleSendChat}
              onClearHistory={handleClearHistory}
              onInstallOllama={handleInstallOllama}
              onStartOllama={handleStartOllama}
              onRefreshOllama={handleRefreshOllama}
              onToggleAutoApprove={handleToggleAutoApprove}
            />
          </Panel>
        </PanelGroup>
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        models={models}
        ollamaStatus={ollamaStatus}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onClearHistory={handleClearHistory}
        onRefreshModels={handleRefreshModels}
        onSearchModels={handleSearchModels}
        onPullModel={handlePullModel}
      />

      {pendingEdit && !pendingFilePlan && (
        <DiffReviewPanel
          edit={pendingEdit}
          theme={settings.theme}
          language={activeTab?.language ?? "plaintext"}
          onAccept={() => void handleAcceptEdit()}
          onReject={() => setPendingEdit(null)}
        />
      )}

      {pendingFilePlan && (
        <FilePlanReviewPanel
          plan={pendingFilePlan}
          applying={applyingFilePlan}
          onAccept={() => void handleApproveFilePlan()}
          onReject={() => setPendingFilePlan(null)}
        />
      )}

      {pendingCommand && (
        <CommandReviewPanel
          command={pendingCommand}
          projectRoot={rootPath ?? "No project"}
          running={runningCommand}
          onApprove={() => void handleApproveCommand()}
          onReject={() => setPendingCommand(null)}
        />
      )}
    </div>
  );
}
