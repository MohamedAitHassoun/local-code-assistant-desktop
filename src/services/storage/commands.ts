import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, ChatMessage, ProjectSession, RecentProject } from "@/types";

export async function loadSettings(): Promise<AppSettings> {
  return invoke("load_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke("save_settings", { settings });
}

export async function loadChatHistory(projectPath?: string): Promise<ChatMessage[]> {
  return invoke("load_chat_history", { projectPath: projectPath ?? null, limit: 200 });
}

export async function appendChatMessage(message: ChatMessage): Promise<void> {
  await invoke("append_chat_message", { message });
}

export async function clearChatHistory(projectPath?: string): Promise<void> {
  await invoke("clear_chat_history", { projectPath: projectPath ?? null });
}

export async function loadRecentProjects(): Promise<RecentProject[]> {
  return invoke("load_recent_projects");
}

export async function addRecentProject(path: string): Promise<void> {
  await invoke("add_recent_project", { path });
}

export async function loadProjectSession(projectPath: string): Promise<ProjectSession | null> {
  return invoke("load_project_session", { projectPath });
}

export async function saveProjectSession(projectPath: string, metadataJson: string): Promise<void> {
  await invoke("save_project_session", { projectPath, metadataJson });
}
