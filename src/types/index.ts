export type ChatRole = "system" | "user" | "assistant";

export interface AppSettings {
  modelName: string;
  ollamaEndpoint: string;
  temperature: number;
  maxTokens: number;
  includeCurrentFile: boolean;
  includeSelection: boolean;
  maxFilesInContext: number;
  contextMode: "focused" | "balanced" | "wide";
  theme: "light" | "dark";
  ignoredFolders: string[];
  commandExecutionEnabled: boolean;
  allowAnyCommand: boolean;
  allowedCommandPrefixes: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  projectPath?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ChatContextPayload {
  userPrompt: string;
  intent:
    | "chat"
    | "explain"
    | "debug"
    | "refactor"
    | "tests"
    | "file_summary"
    | "project_summary"
    | "fix";
  filePath?: string;
  fileContent?: string;
  selection?: string;
  selectedFiles?: ContextFile[];
  projectSummary?: string;
  projectFileIndex?: string[];
}

export interface ContextFile {
  path: string;
  content: string;
  mediaType?: "text" | "document" | "image";
  imageBase64?: string;
}

export interface ContextFileResult {
  path: string;
  content: string;
  size: number;
  language: string;
  mediaType: "text" | "document" | "image";
  imageBase64?: string;
}

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
  size?: number;
  language?: string;
}

export interface ScannedFile {
  path: string;
  relativePath: string;
  size: number;
  language: string;
}

export interface ProjectScanResult {
  rootPath: string;
  tree: FileNode;
  files: ScannedFile[];
  skippedEntries: number;
}

export interface TextFileResult {
  path: string;
  content: string;
  size: number;
  language: string;
}

export interface EditorTab {
  path: string;
  name: string;
  language: string;
  content: string;
  savedContent: string;
  dirty: boolean;
}

export interface SelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  text: string;
}

export interface SuggestedEdit {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  reason: string;
  sourceMessageId?: string;
  createdAt: string;
}

export interface SuggestedCommand {
  id: string;
  command: string;
  reason: string;
  sourceMessageId?: string;
  createdAt: string;
}

export interface CommandRunResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SuggestedFileOperation {
  relativePath: string;
  action: "create" | "update" | "delete";
  originalContent?: string;
  proposedContent?: string;
}

export interface SuggestedFilePlan {
  id: string;
  operations: SuggestedFileOperation[];
  reason: string;
  sourceMessageId?: string;
  createdAt: string;
}

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  message: string;
  detectedPath?: string;
}

export interface OllamaModel {
  name: string;
  size?: number;
  modifiedAt?: string;
}

export interface OllamaStreamEvent {
  requestId: string;
  delta?: string;
  done: boolean;
  error?: string;
}

export interface OllamaChatRequest {
  endpoint: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  images?: string[];
}

export interface RecentProject {
  path: string;
  openedAt: string;
}

export interface ProjectSession {
  projectPath: string;
  metadataJson: string;
  updatedAt: string;
}

export interface FileChunk {
  filePath: string;
  chunkIndex: number;
  content: string;
}
