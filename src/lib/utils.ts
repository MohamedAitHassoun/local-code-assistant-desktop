import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
}

export function parseFirstCodeBlock(input: string): string | null {
  const match = input.match(/```(?:[a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/);
  if (!match) {
    return null;
  }

  return match[1].trimEnd();
}

export function parseFirstShellCommandBlock(input: string): string | null {
  const match = input.match(/```(?:bash|sh|zsh|shell)\n([\s\S]*?)```/i);
  if (!match) {
    return null;
  }

  const script = match[1]
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .trim();

  return script.length > 0 ? script : null;
}

export interface ParsedFileOperationDraft {
  path: string;
  action: "create" | "update" | "delete";
  content?: string;
}

function normalizeDraftAction(action: string): ParsedFileOperationDraft["action"] | null {
  const normalized = action.trim().toLowerCase();
  if (normalized === "create") return "create";
  if (normalized === "update") return "update";
  if (normalized === "delete") return "delete";
  if (normalized === "upsert") return "update";
  return null;
}

export function parseFileOperationsFromAssistant(input: string): ParsedFileOperationDraft[] {
  const blockRegex = /```json\s*([\s\S]*?)```/gi;
  const drafts: ParsedFileOperationDraft[] = [];

  for (const match of input.matchAll(blockRegex)) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    const container = parsed as {
      fileOperations?: Array<{ path?: string; action?: string; content?: string }>;
      edits?: Array<{ path?: string; action?: string; content?: string }>;
    };

    const operations = container.fileOperations ?? container.edits;
    if (!Array.isArray(operations)) continue;

    for (const operation of operations) {
      const path = typeof operation.path === "string" ? operation.path.trim() : "";
      const action =
        typeof operation.action === "string" ? normalizeDraftAction(operation.action) : null;
      const content = typeof operation.content === "string" ? operation.content : undefined;

      if (!path || !action) continue;
      if ((action === "create" || action === "update") && typeof content !== "string") continue;

      drafts.push({
        path,
        action,
        content
      });
    }
  }

  return drafts;
}

export function buildTimestamp(): string {
  return new Date().toISOString();
}

export function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, "/");
}
