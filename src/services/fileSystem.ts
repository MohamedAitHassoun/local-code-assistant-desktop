import { invoke } from "@tauri-apps/api/core";
import type { ContextFileResult, ProjectScanResult, TextFileResult } from "@/types";

export interface FileOperationInput {
  relativePath: string;
  action: "create" | "update" | "delete";
  content?: string;
}

export async function scanProject(rootPath: string, ignoredFolders: string[]): Promise<ProjectScanResult> {
  return invoke("scan_project", {
    rootPath,
    ignoredFolders,
    maxFileSizeBytes: 8_000_000
  });
}

export async function readTextFile(path: string, allowedRoot?: string): Promise<TextFileResult> {
  return invoke("read_text_file", {
    path,
    allowedRoot: allowedRoot ?? null,
    maxBytes: 1_500_000
  });
}

export async function readContextFile(path: string, allowedRoot?: string): Promise<ContextFileResult> {
  return invoke("read_context_file", {
    path,
    allowedRoot: allowedRoot ?? null,
    maxBytes: 1_500_000,
    maxImageBytes: 5_000_000
  });
}

export async function saveTextFile(path: string, content: string, allowedRoot?: string): Promise<void> {
  await invoke("save_text_file", {
    path,
    content,
    allowedRoot: allowedRoot ?? null
  });
}

export async function applyFileOperations(
  projectRoot: string,
  operations: FileOperationInput[]
): Promise<string[]> {
  return invoke("apply_file_operations", {
    projectRoot,
    operations
  });
}
