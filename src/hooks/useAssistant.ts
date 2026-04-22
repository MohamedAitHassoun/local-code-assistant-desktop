import { useCallback } from "react";
import {
  basename,
  buildTimestamp,
  normalizePath,
  parseFileOperationsFromAssistant,
  parseFirstCodeBlock,
  parseFirstShellCommandBlock
} from "@/lib/utils";
import { replaceSelectionInText } from "@/lib/editor";
import { applyFileOperations, readContextFile, scanProject } from "@/services/fileSystem";
import { streamOllamaChat } from "@/services/ollama/client";
import { chooseTopFilesForContext } from "@/services/project/analysis";
import { systemPromptForIntent, userPromptForIntent } from "@/services/prompts/templates";
import { appendChatMessage } from "@/services/storage/commands";
import { runProjectCommand } from "@/services/terminal/commands";
import { useChatStore } from "@/stores/chatStore";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type {
  ChatContextPayload,
  ChatMessage,
  ContextFile,
  SuggestedFileOperation
} from "@/types";

interface SendAssistantArgs {
  prompt: string;
  intent: ChatContextPayload["intent"];
}

async function hydrateContextFiles(
  paths: string[],
  allowedRoot?: string
): Promise<{ files: ContextFile[]; images: string[] }> {
  const files: ContextFile[] = [];
  const images: string[] = [];

  for (const path of paths) {
    try {
      const file = await readContextFile(path, allowedRoot);

      if (file.mediaType === "image" && file.imageBase64) {
        images.push(file.imageBase64);
      }

      files.push({
        path: file.path,
        content: file.content.slice(0, 12000),
        mediaType: file.mediaType,
        imageBase64: file.mediaType === "image" ? undefined : file.imageBase64
      });
    } catch {
      // Keep the request resilient even if one file fails to load.
    }
  }

  return { files, images };
}

function looksLikeExecutionRequest(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const hints = [
    "create",
    "build",
    "generate",
    "scaffold",
    "setup",
    "set up",
    "implement",
    "develop",
    "make",
    "add",
    "in this folder",
    "in this project",
    "in the opened folder",
    "in the open folder"
  ];

  return hints.some((hint) => text.includes(hint));
}

function looksLikeProjectAnalysisRequest(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const analysisVerbPattern =
    /\b(explain|analyze|analyse|summarize|summarise|understand|review|walk(?:\s+me)?\s+through)\b/;
  const projectScopeHints = [
    "project",
    "repo",
    "repository",
    "codebase",
    "folder",
    "this app"
  ];

  return analysisVerbPattern.test(text) && projectScopeHints.some((hint) => text.includes(hint));
}

function looksLikeFileAnalysisRequest(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const asksForExplanation =
    /\b(what\s+does|what\s+is|explain|analyze|analyse|summarize|summarise|describe)\b/.test(text);
  const fileMentioned =
    /\b[\w.-]+\.(py|js|ts|tsx|jsx|java|cpp|cc|cxx|c|h|hpp|json|html|css|md|txt)\b/i.test(prompt);

  return asksForExplanation && fileMentioned;
}

function shouldUseAutonomousForPrompt(prompt: string): boolean {
  return (
    looksLikeExecutionRequest(prompt) ||
    looksLikeProjectAnalysisRequest(prompt) ||
    looksLikeFileAnalysisRequest(prompt)
  );
}

type AgentDecision =
  | {
      action: "read_file";
      path: string;
      reason?: string;
    }
  | {
      action: "run_command";
      command: string;
      reason?: string;
    }
  | {
      action: "apply_file_operations";
      fileOperations: SuggestedFileOperation[];
      reason?: string;
    }
  | {
      action: "final";
      message: string;
      reason?: string;
    };

function normalizeAgentAction(action: unknown): string {
  if (typeof action !== "string") {
    return "";
  }

  return action.trim().toLowerCase();
}

function parseJsonFromAssistant(input: string): Record<string, unknown> | null {
  const codeBlock = input.match(/```json\s*([\s\S]*?)```/i);
  const candidate = codeBlock?.[1]?.trim() ?? input.trim();
  if (!candidate.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeAgentFileOperationAction(action: unknown): SuggestedFileOperation["action"] | null {
  if (typeof action !== "string") {
    return null;
  }

  const normalized = action.trim().toLowerCase();
  if (normalized === "create") return "create";
  if (normalized === "update" || normalized === "upsert") return "update";
  if (normalized === "delete") return "delete";
  return null;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLooseJsonLikeStringField(input: string, field: string): string | null {
  const fieldPattern = new RegExp(`(?:["']?${escapeRegex(field)}["']?)\\s*:\\s*([\"'])`, "i");
  const match = fieldPattern.exec(input);
  if (!match) {
    return null;
  }

  const quoteChar = match[1];
  let index = match.index + match[0].length;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    const prev = index > 0 ? input[index - 1] : "";

    if (char === quoteChar && prev !== "\\") {
      let lookAhead = index + 1;
      while (lookAhead < input.length && /\s/.test(input[lookAhead])) {
        lookAhead += 1;
      }

      if (
        lookAhead >= input.length ||
        input[lookAhead] === "," ||
        input[lookAhead] === "}" ||
        input[lookAhead] === "]"
      ) {
        return value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, "\"")
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, "\\");
      }
    }

    value += char;
    index += 1;
  }

  return value.trim() ? value : null;
}

function parseLooseAgentDecision(input: string): AgentDecision | null {
  const actionMatch = input.match(
    /(?:["']?action["']?)\s*:\s*["']?(read_file|run_command|apply_file_operations|final)["']?/i
  );

  if (!actionMatch) {
    return null;
  }

  const action = normalizeAgentAction(actionMatch[1]);
  const reason = parseLooseJsonLikeStringField(input, "reason")?.trim() || undefined;

  if (action === "read_file") {
    const path = parseLooseJsonLikeStringField(input, "path")?.trim();
    if (!path) {
      return null;
    }

    return {
      action: "read_file",
      path,
      reason
    };
  }

  if (action === "run_command") {
    const command = parseLooseJsonLikeStringField(input, "command")?.trim();
    if (!command) {
      return null;
    }

    return {
      action: "run_command",
      command,
      reason
    };
  }

  if (action === "apply_file_operations") {
    const ops = parseFileOperationsFromAssistant(input).map((operation) => ({
      relativePath: operation.path,
      action: operation.action,
      proposedContent: operation.content
    }));

    if (ops.length === 0) {
      return null;
    }

    return {
      action: "apply_file_operations",
      fileOperations: ops,
      reason
    };
  }

  if (action === "final") {
    const message = parseLooseJsonLikeStringField(input, "message")?.trim() || input.trim();
    return {
      action: "final",
      message,
      reason
    };
  }

  return null;
}

function looksLikeActionPayload(input: string): boolean {
  const normalized = input.trim();
  if (!normalized) {
    return false;
  }

  return /(?:["']?action["']?)\s*:\s*["']?(read_file|run_command|apply_file_operations|final)["']?/i.test(
    normalized
  );
}

function isLikelyFileMutationCommand(command: string): boolean {
  const normalized = command.toLowerCase();

  if (/\b(echo|printf|cat)\b/.test(normalized) && (normalized.includes(">") || normalized.includes(">>"))) {
    return true;
  }

  return (
    /\bcat\s*<<[-\w'"]*/.test(normalized) ||
    /\btee\b/.test(normalized) ||
    /\bsed\s+-i\b/.test(normalized) ||
    /\bperl\s+-i\b/.test(normalized)
  );
}

function parseAgentDecision(input: string): AgentDecision {
  const parsed = parseJsonFromAssistant(input);
  if (!parsed) {
    const looseDecision = parseLooseAgentDecision(input);
    if (looseDecision) {
      return looseDecision;
    }

    const ops = parseFileOperationsFromAssistant(input).map((operation) => ({
      relativePath: operation.path,
      action: operation.action,
      proposedContent: operation.content
    }));

    if (ops.length > 0) {
      return {
        action: "apply_file_operations",
        fileOperations: ops,
        reason: "Parsed file operations from assistant response"
      };
    }

    return {
      action: "final",
      message: input.trim()
    };
  }

  const action = normalizeAgentAction(parsed.action);
  const reason = typeof parsed.reason === "string" ? parsed.reason : undefined;

  if (action === "read_file" && typeof parsed.path === "string" && parsed.path.trim()) {
    return {
      action: "read_file",
      path: parsed.path.trim(),
      reason
    };
  }

  if (action === "run_command" && typeof parsed.command === "string" && parsed.command.trim()) {
    return {
      action: "run_command",
      command: parsed.command.trim(),
      reason
    };
  }

  if (action === "apply_file_operations") {
    const raw = Array.isArray(parsed.fileOperations)
      ? parsed.fileOperations
      : Array.isArray(parsed.operations)
        ? parsed.operations
        : [];

    const fileOperations: SuggestedFileOperation[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const maybe = item as Record<string, unknown>;
      const path = typeof maybe.path === "string" ? maybe.path.trim() : "";
      const opAction = normalizeAgentFileOperationAction(maybe.action);
      const content = typeof maybe.content === "string" ? maybe.content : undefined;
      if (!path || !opAction) continue;
      if ((opAction === "create" || opAction === "update") && typeof content !== "string") {
        continue;
      }

      fileOperations.push({
        relativePath: path,
        action: opAction,
        proposedContent: content
      });
    }

    if (fileOperations.length > 0) {
      return {
        action: "apply_file_operations",
        fileOperations,
        reason
      };
    }
  }

  const message =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : input.trim();

  return {
    action: "final",
    message
  };
}

function truncateObservation(input: string, maxChars = 6000): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}\n...[truncated]`;
}

function resolvePathHintInProject(pathHint: string, rootPath: string, indexedPaths: string[]): string | null {
  const normalizedHint = normalizePath(pathHint).trim();
  if (!normalizedHint) {
    return null;
  }

  const normalizedRoot = normalizePath(rootPath).replace(/\/+$/, "");
  if (normalizedHint.startsWith("/")) {
    return normalizedHint.startsWith(`${normalizedRoot}/`) || normalizedHint === normalizedRoot
      ? normalizedHint
      : null;
  }

  const stripped = normalizedHint.replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (stripped.includes("/")) {
    return `${normalizedRoot}/${stripped}`.replace(/\/{2,}/g, "/");
  }

  const exact = indexedPaths.find(
    (value) => basename(value).toLowerCase() === stripped.toLowerCase()
  );

  if (exact) {
    return exact;
  }

  const fuzzy = indexedPaths.find((value) => value.toLowerCase().endsWith(`/${stripped.toLowerCase()}`));
  if (fuzzy) {
    return fuzzy;
  }

  return `${normalizedRoot}/${stripped}`.replace(/\/{2,}/g, "/");
}

export function useAssistant() {
  const settings = useSettingsStore((state) => state.settings);
  const {
    appendMessage,
    appendMessageContent,
    updateMessageContent,
    setLoading,
    setError
  } = useChatStore();
  const { tabs, activePath, selection, setPendingEdit, setPendingCommand, setPendingFilePlan } =
    useEditorStore();
  const { rootPath, selectedContextFiles, projectSummary, files, setProject, setIsScanning } =
    useProjectStore();

  const sendAssistantPrompt = useCallback(
    async ({ prompt, intent }: SendAssistantArgs): Promise<string> => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
        createdAt: buildTimestamp(),
        projectPath: rootPath ?? undefined,
        metadata: { intent }
      };

      appendMessage(userMessage);
      void appendChatMessage(userMessage);

      const assistantMessageId = crypto.randomUUID();
      appendMessage({
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: buildTimestamp(),
        projectPath: rootPath ?? undefined,
        metadata: { intent }
      });

      setLoading(true);
      setError(null);

      let suppressSystemEvents = false;
      const pushSystemEvent = (content: string) => {
        if (suppressSystemEvents) {
          return;
        }

        const statusMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content,
          createdAt: buildTimestamp(),
          projectPath: rootPath ?? undefined,
          metadata: { intent }
        };

        appendMessage(statusMessage);
        void appendChatMessage(statusMessage);
      };

      const activeTab = tabs.find((tab) => tab.path === activePath);
      const includeCurrentFile = settings.includeCurrentFile && Boolean(activeTab);
      const includeSelection = settings.includeSelection && Boolean(selection?.text?.trim());

      const fallbackContextFiles =
        selectedContextFiles.length > 0
          ? selectedContextFiles
          : intent === "project_summary"
            ? chooseTopFilesForContext(files, settings.maxFilesInContext).map(
                (file) => file.path
              )
            : [];

      const chosenContextFiles = fallbackContextFiles.slice(0, settings.maxFilesInContext);
      const hydratedContext = await hydrateContextFiles(chosenContextFiles, rootPath ?? undefined);

      const payload: ChatContextPayload = {
        userPrompt: prompt,
        intent,
        filePath: includeCurrentFile ? activeTab?.path : undefined,
        fileContent: includeCurrentFile ? activeTab?.content : undefined,
        selection: includeSelection ? selection?.text : undefined,
        selectedFiles: hydratedContext.files,
        projectSummary: projectSummary || undefined,
        projectFileIndex: files.slice(0, 600).map((file) => file.relativePath)
      };

      const systemPrompt = systemPromptForIntent(intent);
      const userPrompt = userPromptForIntent(payload);
      const executionRequest = intent === "chat" && looksLikeExecutionRequest(prompt);
      const hideAssistantWhileWorking = executionRequest;
      const autonomousMode =
        settings.autonomousAgentEnabled &&
        intent === "chat" &&
        Boolean(rootPath) &&
        shouldUseAutonomousForPrompt(prompt);
      suppressSystemEvents = autonomousMode || hideAssistantWhileWorking;

      const callModel = async (
        modelSystemPrompt: string,
        modelUserPrompt: string,
        streamToMessage: boolean
      ): Promise<string> => {
        return streamOllamaChat(
          {
            endpoint: settings.ollamaEndpoint,
            model: settings.modelName,
            systemPrompt: modelSystemPrompt,
            userPrompt: modelUserPrompt,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            images: hydratedContext.images
          },
          (delta) => {
            if (streamToMessage && !hideAssistantWhileWorking) {
              appendMessageContent(assistantMessageId, delta);
            }
          }
        );
      };

      const runAutonomousLoop = async (): Promise<string> => {
        if (!rootPath) {
          return "Open a project folder first, then I can autonomously inspect files and run steps.";
        }

        const maxSteps = Math.min(Math.max(settings.maxAgentSteps || 8, 2), 20);
        const indexedPaths = files.map((file) => normalizePath(file.path));
        const indexedRelativePaths = files
          .slice(0, 500)
          .map((file) => file.relativePath)
          .join("\n");

        const observations: string[] = [
          `Project root: ${rootPath}`,
          indexedRelativePaths
            ? `Project files (sample):\n${indexedRelativePaths}`
            : "Project files list is currently empty."
        ];

        const mentionedFile = prompt.match(
          /\b[\w.-]+\.(py|js|ts|tsx|jsx|java|cpp|cc|cxx|c|h|hpp|json|html|css|md|txt)\b/i
        );
        if (mentionedFile) {
          const resolvedMention = resolvePathHintInProject(mentionedFile[0], rootPath, indexedPaths);
          if (resolvedMention) {
            try {
              const mentioned = await readContextFile(resolvedMention, rootPath);
              observations.push(
                `Preloaded requested file ${normalizePath(mentioned.path)}:\n${truncateObservation(
                  mentioned.content,
                  10000
                )}`
              );
              pushSystemEvent(`Loaded requested file: ${basename(mentioned.path)}`);
            } catch {
              // Keep loop resilient if initial file read fails.
            }
          }
        }

        const commandExecutionReady =
          settings.commandExecutionEnabled || settings.fullAccessMode;
        const repeatedActionCounts = new Map<string, number>();
        const duplicateActionLimit = 2;

        for (let step = 1; step <= maxSteps; step += 1) {
          pushSystemEvent(`Working... step ${step}/${maxSteps}`);

          const agentSystemPrompt = `You are an autonomous local coding agent with tool-like actions.
Return ONLY JSON with one action:
{"action":"read_file","path":"relative/or/absolute/path","reason":"..."}
{"action":"run_command","command":"single command","reason":"..."}
{"action":"apply_file_operations","fileOperations":[{"path":"relative/path.ext","action":"create|update|delete","content":"..."}],"reason":"..."}
{"action":"final","message":"final answer for user","reason":"..."}

Rules:
- Inspect files before explaining project internals.
- If user asks about a specific file, read that file first.
- Use one command at a time.
- For creating/updating/deleting source files, ALWAYS use apply_file_operations with full contents.
- Do NOT use run_command to write file contents (no echo/printf/cat heredoc/redirection/tee for code files).
- Use run_command only for safe inspection/testing/opening tasks.
- File operation paths must be relative to project root.
- Return final only after requested work is done or if blocked with a clear reason.`;

          const agentUserPrompt = `User request:
${prompt}

Current observations:
${observations.map((item, index) => `${index + 1}. ${item}`).join("\n\n")}

Choose the next best action and return ONLY JSON.`;

          const decisionText = await callModel(agentSystemPrompt, agentUserPrompt, false);
          let decision = parseAgentDecision(decisionText);

          if (decision.action === "final") {
            const nestedDecision = parseAgentDecision(decision.message);
            if (nestedDecision.action !== "final") {
              observations.push(
                "Assistant returned an action payload inside final output. Executing that action."
              );
              decision = nestedDecision;
            }
          }

          const decisionSignature = (() => {
            switch (decision.action) {
              case "read_file":
                return `read_file:${normalizePath(decision.path).toLowerCase()}`;
              case "run_command":
                return `run_command:${decision.command.trim().toLowerCase()}`;
              case "apply_file_operations":
                return `apply_file_operations:${decision.fileOperations
                  .map(
                    (operation) =>
                      `${operation.action}:${normalizePath(operation.relativePath).toLowerCase()}`
                  )
                  .sort()
                  .join("|")}`;
              case "final":
                return "final";
              default:
                return "unknown";
            }
          })();

          const seenCount = repeatedActionCounts.get(decisionSignature) ?? 0;
          repeatedActionCounts.set(decisionSignature, seenCount + 1);

          if (decision.action !== "final" && seenCount >= duplicateActionLimit) {
            const note = `Duplicate step detected for ${decision.action}. Avoid repeating identical actions; continue with a different action or return final.`;
            observations.push(note);
            pushSystemEvent(note);
            continue;
          }

          if (decision.action === "final") {
            return decision.message || "Task completed.";
          }

          if (decision.action === "read_file") {
            const resolved = resolvePathHintInProject(decision.path, rootPath, indexedPaths);
            if (!resolved) {
              const note = `Could not resolve file path: ${decision.path}`;
              observations.push(note);
              pushSystemEvent(note);
              continue;
            }

            try {
              const file = await readContextFile(resolved, rootPath);
              const fileNote = `Read ${normalizePath(file.path)}:\n${truncateObservation(
                file.content,
                10000
              )}`;
              observations.push(fileNote);
              pushSystemEvent(`Read file: ${basename(file.path)}`);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Failed to read requested file.";
              observations.push(`Read file error for ${decision.path}: ${message}`);
              pushSystemEvent(`Read file failed: ${decision.path}`);
            }
            continue;
          }

          if (decision.action === "run_command") {
            if (isLikelyFileMutationCommand(decision.command)) {
              observations.push(
                `Rejected command for file mutation: ${decision.command}. Use apply_file_operations to modify files instead.`
              );
              continue;
            }

            if (!commandExecutionReady) {
              const note =
                "Command execution is blocked by settings. Enable Full Access Mode or command execution.";
              observations.push(note);
              pushSystemEvent(note);
              continue;
            }

            try {
              const result = await runProjectCommand({
                command: decision.command,
                projectRoot: rootPath,
                allowedPrefixes: settings.allowedCommandPrefixes,
                timeoutSeconds: 240
              });

              const commandObservation = [
                `Command: ${decision.command}`,
                `Exit code: ${result.exitCode ?? "none"}`,
                result.stdout ? `Stdout:\n${truncateObservation(result.stdout, 5000)}` : "",
                result.stderr ? `Stderr:\n${truncateObservation(result.stderr, 5000)}` : ""
              ]
                .filter(Boolean)
                .join("\n");

              observations.push(commandObservation);
              pushSystemEvent(
                `Ran command (${result.exitCode ?? "none"}): ${decision.command.slice(0, 80)}`
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Command execution failed.";
              observations.push(`Command error (${decision.command}): ${message}`);
              pushSystemEvent(`Command failed: ${decision.command.slice(0, 80)}`);
            }
            continue;
          }

          if (decision.action === "apply_file_operations") {
            const operations = decision.fileOperations
              .map((operation) => {
                const normalizedRoot = normalizePath(rootPath).replace(/\/+$/, "");
                const rawPath = normalizePath(operation.relativePath).trim();
                const asRelative = rawPath.startsWith(`${normalizedRoot}/`)
                  ? rawPath.slice(normalizedRoot.length + 1)
                  : rawPath;
                const relativePath = asRelative.replace(/^\.\/+/, "").replace(/^\/+/, "");
                return {
                  relativePath,
                  action: operation.action,
                  content:
                    operation.action === "delete" ? undefined : operation.proposedContent ?? ""
                };
              })
              .filter((operation) => operation.relativePath.length > 0);

            if (operations.length === 0) {
              observations.push("No valid file operations were provided.");
              continue;
            }

            try {
              const applied = await applyFileOperations(rootPath, operations);
              observations.push(
                applied.length > 0
                  ? `Applied file operations:\n${applied.join("\n")}`
                  : "No file operations were applied."
              );
              pushSystemEvent(
                `Applied ${operations.length} file operation${
                  operations.length === 1 ? "" : "s"
                }.`
              );

              setIsScanning(true);
              try {
                const refreshed = await scanProject(rootPath, settings.ignoredFolders);
                setProject(refreshed);
              } finally {
                setIsScanning(false);
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Failed to apply file operations.";
              observations.push(`Apply file operations error: ${message}`);
              pushSystemEvent("Applying file operations failed.");
            }
          }
        }

        return `I reached the autonomous step limit (${maxSteps}). Ask me to continue if you want me to proceed with more steps.`;
      };

      let assistantContent = "";
      let autoApplySingleEdit = false;
      let detectedCommand = false;
      if (hideAssistantWhileWorking) {
        pushSystemEvent("Thinking...");
        updateMessageContent(assistantMessageId, "Thinking...");
      }

      try {
        if (autonomousMode) {
          if (hideAssistantWhileWorking) {
            pushSystemEvent("Autonomous agent mode enabled.");
          }
          assistantContent = await runAutonomousLoop();
        } else {
          assistantContent = await callModel(systemPrompt, userPrompt, true);
        }

        let hasFileOperationDrafts = false;
        if (!autonomousMode) {
          const fileOperationDrafts = parseFileOperationsFromAssistant(assistantContent);
          hasFileOperationDrafts = fileOperationDrafts.length > 0;

          if (hasFileOperationDrafts) {
            if (!rootPath) {
              setError(
                "AI suggested multi-file changes, but no project folder is open. Open a project to review and apply file changes."
              );
            } else {
              const normalizedRoot = normalizePath(rootPath).replace(/\/+$/, "");

              const operations = await Promise.all(
                fileOperationDrafts.map(async (draft) => {
                  const relativePath = normalizePath(draft.path)
                    .replace(/^\.\/+/, "")
                    .replace(/^\/+/, "")
                    .trim();
                  const absolutePath = `${normalizedRoot}/${relativePath}`.replace(/\/{2,}/g, "/");

                  let originalContent: string | undefined;
                  if (draft.action !== "create") {
                    try {
                      const currentFile = await readContextFile(absolutePath, rootPath);
                      originalContent = currentFile.content;
                    } catch {
                      originalContent = undefined;
                    }
                  }

                  return {
                    relativePath,
                    action: draft.action,
                    originalContent,
                    proposedContent: draft.content
                  };
                })
              );

              const validOperations = operations.filter((operation) => operation.relativePath.length > 0);

              if (validOperations.length > 0) {
                const autoApply =
                  settings.autoApproveActions ||
                  hideAssistantWhileWorking ||
                  (settings.agenticMode &&
                    settings.autoApplyFilePlans &&
                    intent === "chat" &&
                    looksLikeExecutionRequest(prompt));

                setPendingEdit(null);
                setPendingFilePlan({
                  id: crypto.randomUUID(),
                  operations: validOperations,
                  reason: `Suggested multi-file ${intent.replace("_", " ")} plan`,
                  autoApply,
                  sourceMessageId: assistantMessageId,
                  createdAt: buildTimestamp()
                });

                const operationLines = validOperations.map(
                  (operation, index) =>
                    `${index + 1}. ${operation.action.toUpperCase()} ${operation.relativePath}`
                );

                if (hideAssistantWhileWorking) {
                  pushSystemEvent(
                    `Prepared ${validOperations.length} change operation${
                      validOperations.length === 1 ? "" : "s"
                    }${autoApply ? " and started applying." : "."}`
                  );
                } else {
                  pushSystemEvent(
                    `Prepared ${validOperations.length} file operation${
                      validOperations.length === 1 ? "" : "s"
                    }${autoApply ? " and auto-apply is enabled." : " for review."}\n${operationLines.join("\n")}`
                  );
                }
              }
            }
          }

          if (!hasFileOperationDrafts && ["fix", "refactor", "tests"].includes(intent) && activeTab) {
            const suggestionCode = parseFirstCodeBlock(assistantContent);
            if (suggestionCode) {
              const proposedContent = includeSelection && selection
                ? replaceSelectionInText(activeTab.content, selection, suggestionCode)
                : suggestionCode;
              autoApplySingleEdit = settings.autoApproveActions || hideAssistantWhileWorking;

              setPendingEdit({
                id: crypto.randomUUID(),
                filePath: activeTab.path,
                originalContent: activeTab.content,
                proposedContent,
                reason: `${intent.replace("_", " ")} suggestion`,
                autoApply: autoApplySingleEdit,
                sourceMessageId: assistantMessageId,
                createdAt: buildTimestamp()
              });

              if (autoApplySingleEdit) {
                pushSystemEvent("Prepared inline edit and auto-apply is enabled.");
              }
            }
          }

          const suggestedCommand = parseFirstShellCommandBlock(assistantContent);
          if (suggestedCommand) {
            detectedCommand = true;
            if (settings.commandExecutionEnabled && rootPath) {
              setPendingCommand({
                id: crypto.randomUUID(),
                command: suggestedCommand,
                reason: `Suggested command from ${intent.replace("_", " ")} response`,
                sourceMessageId: assistantMessageId,
                createdAt: buildTimestamp()
              });
              if (settings.autoApproveActions) {
                pushSystemEvent("Prepared command and auto-approve is enabled.");
              }
            } else if (!settings.commandExecutionEnabled) {
              setError("Command suggestion detected. Enable command execution in Settings to review and run it.");
            } else if (!rootPath) {
              setError("Command suggestion detected. Open a project folder before running commands.");
            }
          }
        }

        const trimmedAssistantContent = assistantContent.trim();
        const cleanedAutonomousContent =
          trimmedAssistantContent && !looksLikeActionPayload(trimmedAssistantContent)
            ? trimmedAssistantContent
            : "";
        const hasAutoActionFollowup =
          hasFileOperationDrafts || autoApplySingleEdit || (detectedCommand && settings.autoApproveActions);

        const displayAssistantContent = autonomousMode
          ? cleanedAutonomousContent
            ? `Done. Request completed.\n\n${cleanedAutonomousContent}`
            : "Done. Request completed."
          : hideAssistantWhileWorking
            ? hasAutoActionFollowup
              ? "Done. I prepared/executed the requested actions."
              : "Done. Request completed."
            : assistantContent;

        updateMessageContent(assistantMessageId, displayAssistantContent);

        const assistantFinal: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: displayAssistantContent,
          createdAt: buildTimestamp(),
          projectPath: rootPath ?? undefined,
          metadata: { intent }
        };

        void appendChatMessage(assistantFinal);
        return assistantContent;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate assistant response.";
        setError(message);
        updateMessageContent(assistantMessageId, `Error: ${message}`);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [
      activePath,
      appendMessageContent,
      appendMessage,
      files,
      projectSummary,
      rootPath,
      selectedContextFiles,
      selection,
      setError,
      setLoading,
      setIsScanning,
      setPendingEdit,
      setPendingCommand,
      setPendingFilePlan,
      setProject,
      settings,
      tabs,
      updateMessageContent
    ]
  );

  return {
    sendAssistantPrompt
  };
}
