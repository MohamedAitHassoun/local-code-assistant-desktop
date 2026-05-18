import type { AppSettings } from "@/types";

export const SUPPORTED_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".java",
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".h",
  ".hpp",
  ".json",
  ".html",
  ".css",
  ".md",
  ".txt",
  ".pdf",
  ".docx",
  ".doc",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp"
]);

export const DEFAULT_IGNORED_FOLDERS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".venv",
  "target",
  "coverage",
  ".next",
  ".idea",
  ".vscode"
];

export const DEFAULT_ALLOWED_COMMAND_PREFIXES = [
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "rg",
  "find",
  "npm run",
  "npm test",
  "pnpm run",
  "pnpm test",
  "yarn run",
  "yarn test",
  "bun run",
  "bun test",
  "pytest",
  "python -m pytest",
  "cargo test",
  "cargo check",
  "go test",
  "dotnet test",
  "mvn test",
  "gradle test"
];

export const DEFAULT_AI_PROVIDER: AppSettings["aiProvider"] = "openrouter";
export const DEFAULT_OPENROUTER_MODEL = "x-ai/grok-4.1-fast";
export const DEFAULT_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export function normalizeAppSettings(settings: AppSettings): AppSettings {
  const apiProvider = settings.aiProvider || DEFAULT_AI_PROVIDER;
  const openrouterModel = settings.openrouterModel?.trim() || DEFAULT_OPENROUTER_MODEL;
  const openrouterEndpoint =
    settings.openrouterEndpoint?.trim() || DEFAULT_OPENROUTER_ENDPOINT;

  return {
    ...settings,
    aiProvider: apiProvider,
    modelName: openrouterModel,
    openrouterModel,
    openrouterEndpoint,
    openrouterApiKey: settings.openrouterApiKey?.trim() ?? "",
    displayModelLabel: settings.displayModelLabel?.trim() ?? ""
  };
}

const BASE_DEFAULT_SETTINGS: AppSettings = {
  aiProvider: DEFAULT_AI_PROVIDER,
  modelName: DEFAULT_OPENROUTER_MODEL,
  displayModelLabel: "",
  openrouterApiKey: "",
  openrouterModel: DEFAULT_OPENROUTER_MODEL,
  openrouterEndpoint: DEFAULT_OPENROUTER_ENDPOINT,
  agenticMode: true,
  autoApplyFilePlans: false,
  autoApproveActions: false,
  workingOnlyMode: true,
  autonomousAgentEnabled: true,
  fullAccessMode: true,
  maxAgentSteps: 20,
  ollamaEndpoint: import.meta.env.VITE_DEFAULT_OLLAMA_URL ?? "http://127.0.0.1:11434",
  temperature: 0.2,
  maxTokens: 2048,
  includeCurrentFile: true,
  includeSelection: true,
  maxFilesInContext: 8,
  contextMode: "balanced",
  theme: "light",
  ignoredFolders: DEFAULT_IGNORED_FOLDERS,
  commandExecutionEnabled: false,
  allowAnyCommand: false,
  allowedCommandPrefixes: DEFAULT_ALLOWED_COMMAND_PREFIXES
};

export const DEFAULT_SETTINGS: AppSettings = normalizeAppSettings(BASE_DEFAULT_SETTINGS);

export const MAX_READABLE_FILE_BYTES = 1_500_000;
export const CHUNK_SIZE_CHARS = 1800;
