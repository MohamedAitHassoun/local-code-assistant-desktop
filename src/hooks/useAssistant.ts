import { useCallback } from "react";
import {
  buildTimestamp,
  normalizePath,
  parseFileOperationsFromAssistant,
  parseFirstCodeBlock,
  parseFirstShellCommandBlock
} from "@/lib/utils";
import { replaceSelectionInText } from "@/lib/editor";
import { readContextFile } from "@/services/fileSystem";
import { streamOllamaChat } from "@/services/ollama/client";
import { chooseTopFilesForContext } from "@/services/project/analysis";
import { systemPromptForIntent, userPromptForIntent } from "@/services/prompts/templates";
import { appendChatMessage } from "@/services/storage/commands";
import { useChatStore } from "@/stores/chatStore";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ChatContextPayload, ChatMessage, ContextFile } from "@/types";

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
  const { rootPath, selectedContextFiles, projectSummary, files } = useProjectStore();

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

      let assistantContent = "";

      try {
        assistantContent = await streamOllamaChat(
          {
            endpoint: settings.ollamaEndpoint,
            model: settings.modelName,
            systemPrompt,
            userPrompt,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            images: hydratedContext.images
          },
          (delta) => {
            appendMessageContent(assistantMessageId, delta);
          }
        );

        updateMessageContent(assistantMessageId, assistantContent);

        const assistantFinal: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: assistantContent,
          createdAt: buildTimestamp(),
          projectPath: rootPath ?? undefined,
          metadata: { intent }
        };

        void appendChatMessage(assistantFinal);

        const fileOperationDrafts = parseFileOperationsFromAssistant(assistantContent);
        const hasFileOperationDrafts = fileOperationDrafts.length > 0;

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
              setPendingEdit(null);
              setPendingFilePlan({
                id: crypto.randomUUID(),
                operations: validOperations,
                reason: `Suggested multi-file ${intent.replace("_", " ")} plan`,
                sourceMessageId: assistantMessageId,
                createdAt: buildTimestamp()
              });
            }
          }
        }

        if (!hasFileOperationDrafts && ["fix", "refactor", "tests"].includes(intent) && activeTab) {
          const suggestionCode = parseFirstCodeBlock(assistantContent);
          if (suggestionCode) {
            const proposedContent = includeSelection && selection
              ? replaceSelectionInText(activeTab.content, selection, suggestionCode)
              : suggestionCode;

            setPendingEdit({
              id: crypto.randomUUID(),
              filePath: activeTab.path,
              originalContent: activeTab.content,
              proposedContent,
              reason: `${intent.replace("_", " ")} suggestion`,
              sourceMessageId: assistantMessageId,
              createdAt: buildTimestamp()
            });
          }
        }

        const suggestedCommand = parseFirstShellCommandBlock(assistantContent);
        if (suggestedCommand) {
          if (settings.commandExecutionEnabled && rootPath) {
            setPendingCommand({
              id: crypto.randomUUID(),
              command: suggestedCommand,
              reason: `Suggested command from ${intent.replace("_", " ")} response`,
              sourceMessageId: assistantMessageId,
              createdAt: buildTimestamp()
            });
          } else if (!settings.commandExecutionEnabled) {
            setError("Command suggestion detected. Enable command execution in Settings to review and run it.");
          } else if (!rootPath) {
            setError("Command suggestion detected. Open a project folder before running commands.");
          }
        }
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
      setPendingEdit,
      setPendingCommand,
      setPendingFilePlan,
      settings,
      tabs,
      updateMessageContent
    ]
  );

  return {
    sendAssistantPrompt
  };
}
