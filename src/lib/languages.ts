const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".java": "java",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".c": "c",
  ".h": "cpp",
  ".hpp": "cpp",
  ".json": "json",
  ".html": "html",
  ".css": "css",
  ".md": "markdown"
};

export function guessLanguage(filePath: string): string {
  const idx = filePath.lastIndexOf(".");
  if (idx < 0) {
    return "plaintext";
  }

  const ext = filePath.slice(idx).toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] ?? "plaintext";
}
