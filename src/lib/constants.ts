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

export const DEFAULT_SETTINGS: AppSettings = {
  modelName: "qwen2.5-coder:7b",
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

export const MAX_READABLE_FILE_BYTES = 1_500_000;
export const CHUNK_SIZE_CHARS = 1800;
