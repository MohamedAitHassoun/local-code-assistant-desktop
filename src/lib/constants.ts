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

export const FIXED_AI_PROVIDER: AppSettings["aiProvider"] = "openrouter";
export const FIXED_OPENROUTER_MODEL = "qwen/qwen3.5-9b";
export const FIXED_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const EMBEDDED_OPENROUTER_API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY ?? "").trim();

export function normalizeLockedAiSettings(settings: AppSettings): AppSettings {
  const embeddedKey = EMBEDDED_OPENROUTER_API_KEY;
  const resolvedApiKey = embeddedKey || settings.openrouterApiKey.trim();

  return {
    ...settings,
    aiProvider: FIXED_AI_PROVIDER,
    modelName: FIXED_OPENROUTER_MODEL,
    openrouterModel: FIXED_OPENROUTER_MODEL,
    openrouterEndpoint: FIXED_OPENROUTER_ENDPOINT,
    openrouterApiKey: resolvedApiKey
  };
}

const BASE_DEFAULT_SETTINGS: AppSettings = {
  aiProvider: "openrouter",
  modelName: "qwen/qwen3.5-9b",
  displayModelLabel: "",
  openrouterApiKey: EMBEDDED_OPENROUTER_API_KEY,
  openrouterModel: FIXED_OPENROUTER_MODEL,
  openrouterEndpoint: FIXED_OPENROUTER_ENDPOINT,
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

export const DEFAULT_SETTINGS: AppSettings = normalizeLockedAiSettings(BASE_DEFAULT_SETTINGS);

export const MAX_READABLE_FILE_BYTES = 1_500_000;
export const CHUNK_SIZE_CHARS = 1800;
