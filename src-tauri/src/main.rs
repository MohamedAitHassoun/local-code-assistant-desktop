#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::{anyhow, Context};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use chrono::Utc;
use futures_util::StreamExt;
use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::Command as AsyncCommand;
use tokio::time::sleep;
use tokio::time::timeout;
use zip::ZipArchive;

#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct AppSettings {
    ai_provider: String,
    model_name: String,
    display_model_label: String,
    openrouter_api_key: String,
    openrouter_model: String,
    openrouter_endpoint: String,
    agentic_mode: bool,
    auto_apply_file_plans: bool,
    auto_approve_actions: bool,
    working_only_mode: bool,
    autonomous_agent_enabled: bool,
    full_access_mode: bool,
    max_agent_steps: u32,
    ollama_endpoint: String,
    temperature: f32,
    max_tokens: u32,
    include_current_file: bool,
    include_selection: bool,
    max_files_in_context: u32,
    context_mode: String,
    theme: String,
    ignored_folders: Vec<String>,
    command_execution_enabled: bool,
    allow_any_command: bool,
    allowed_command_prefixes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    id: String,
    role: String,
    content: String,
    created_at: String,
    project_path: Option<String>,
    metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentProject {
    path: String,
    opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSession {
    project_path: String,
    metadata_json: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
    size: Option<u64>,
    language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScannedFile {
    path: String,
    relative_path: String,
    size: u64,
    language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectScanResult {
    root_path: String,
    tree: FileNode,
    files: Vec<ScannedFile>,
    skipped_entries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextFileResult {
    path: String,
    content: String,
    size: u64,
    language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextFileResult {
    path: String,
    content: String,
    size: u64,
    language: String,
    media_type: String,
    image_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandRunResult {
    command: String,
    cwd: String,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileOperationInput {
    relative_path: String,
    action: String,
    content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OllamaStatus {
    installed: bool,
    running: bool,
    message: String,
    detected_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexStatus {
    installed: bool,
    message: String,
    detected_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OllamaModel {
    name: String,
    size: Option<u64>,
    modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OllamaChatRequest {
    endpoint: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
    temperature: f32,
    max_tokens: u32,
    images: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenRouterChatRequest {
    endpoint: String,
    api_key: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexChatRequest {
    system_prompt: String,
    user_prompt: String,
    profile: Option<String>,
    model: Option<String>,
    project_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OllamaStreamEvent {
    request_id: String,
    delta: Option<String>,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OllamaPullStreamEvent {
    request_id: String,
    model: String,
    status: Option<String>,
    completed: Option<u64>,
    total: Option<u64>,
    percent: Option<f64>,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenRouterStreamEvent {
    request_id: String,
    delta: Option<String>,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexStreamEvent {
    request_id: String,
    delta: Option<String>,
    status: Option<String>,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn default_allowed_command_prefixes() -> Vec<String> {
    vec![
        "ls".into(),
        "pwd".into(),
        "cat".into(),
        "head".into(),
        "tail".into(),
        "rg".into(),
        "find".into(),
        "npm run".into(),
        "npm test".into(),
        "pnpm run".into(),
        "pnpm test".into(),
        "yarn run".into(),
        "yarn test".into(),
        "bun run".into(),
        "bun test".into(),
        "pytest".into(),
        "python -m pytest".into(),
        "cargo test".into(),
        "cargo check".into(),
        "go test".into(),
        "dotnet test".into(),
        "mvn test".into(),
        "gradle test".into(),
    ]
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            ai_provider: "openrouter".to_string(),
            model_name: "qwen/qwen3.5-9b".to_string(),
            display_model_label: String::new(),
            openrouter_api_key: String::new(),
            openrouter_model: "qwen/qwen3.5-9b".to_string(),
            openrouter_endpoint: "https://openrouter.ai/api/v1/chat/completions".to_string(),
            agentic_mode: true,
            auto_apply_file_plans: false,
            auto_approve_actions: false,
            working_only_mode: true,
            autonomous_agent_enabled: true,
            full_access_mode: true,
            max_agent_steps: 20,
            ollama_endpoint: "http://127.0.0.1:11434".to_string(),
            temperature: 0.2,
            max_tokens: 2048,
            include_current_file: true,
            include_selection: true,
            max_files_in_context: 8,
            context_mode: "balanced".to_string(),
            theme: "light".to_string(),
            ignored_folders: vec![
                "node_modules".into(),
                ".git".into(),
                "dist".into(),
                "build".into(),
                ".venv".into(),
                "target".into(),
                "coverage".into(),
                ".next".into(),
                ".idea".into(),
                ".vscode".into(),
            ],
            command_execution_enabled: false,
            allow_any_command: false,
            allowed_command_prefixes: default_allowed_command_prefixes(),
        }
    }
}

fn default_settings() -> AppSettings {
    AppSettings::default()
}

fn open_db(db_path: &Path) -> Result<Connection, String> {
    Connection::open(db_path).map_err(|err| err.to_string())
}

fn init_db_schema(db_path: &Path) -> Result<(), String> {
    let conn = open_db(db_path)?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            project_path TEXT,
            metadata_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_chat_project_time
            ON chat_messages(project_path, created_at);

        CREATE TABLE IF NOT EXISTS recent_projects (
            path TEXT PRIMARY KEY,
            opened_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_sessions (
            project_path TEXT PRIMARY KEY,
            metadata_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )
    .map_err(|err| err.to_string())?;

    Ok(())
}

fn normalize_endpoint(endpoint: &str) -> String {
    endpoint.trim().trim_end_matches('/').to_string()
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default()
}

fn language_for_path(path: &Path) -> String {
    let ext = file_extension(path);

    match ext.as_str() {
        "py" => "python",
        "js" | "jsx" => "javascript",
        "ts" | "tsx" => "typescript",
        "java" => "java",
        "cpp" | "cc" | "cxx" | "c" | "h" | "hpp" => "cpp",
        "json" => "json",
        "html" => "html",
        "css" => "css",
        "md" => "markdown",
        "txt" => "plaintext",
        "pdf" | "docx" | "doc" => "document",
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" => "image",
        _ => "plaintext",
    }
    .to_string()
}

fn is_editor_text_file(path: &Path) -> bool {
    let ext = file_extension(path);

    matches!(
        ext.as_str(),
        "py" | "js"
            | "jsx"
            | "ts"
            | "tsx"
            | "java"
            | "cpp"
            | "cc"
            | "cxx"
            | "c"
            | "h"
            | "hpp"
            | "json"
            | "html"
            | "css"
            | "md"
            | "txt"
    )
}

fn is_document_file(path: &Path) -> bool {
    matches!(file_extension(path).as_str(), "pdf" | "docx" | "doc")
}

fn is_image_file(path: &Path) -> bool {
    matches!(
        file_extension(path).as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp"
    )
}

fn is_context_supported_file(path: &Path) -> bool {
    is_editor_text_file(path) || is_document_file(path) || is_image_file(path)
}

fn read_utf8_text_file(path: &Path, max_bytes: usize) -> Result<String, String> {
    let bytes = fs::read(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))
        .map_err(|err| err.to_string())?;

    if bytes.len() > max_bytes {
        return Err(format!(
            "File is too large to open safely ({} bytes; max {}).",
            bytes.len(),
            max_bytes
        ));
    }

    if is_binary(&bytes) {
        return Err("This file appears to be binary and cannot be opened as text.".to_string());
    }

    String::from_utf8(bytes)
        .map_err(|_| "This file is not UTF-8 text or appears unreadable.".to_string())
}

fn extract_pdf_text(path: &Path) -> Result<String, String> {
    let extracted = pdf_extract::extract_text(path)
        .with_context(|| format!("Failed to extract text from PDF: {}", path.display()))
        .map_err(|err| err.to_string())?;

    if extracted.trim().is_empty() {
        return Err(
            "The PDF did not contain extractable text. If it is scanned, OCR is required."
                .to_string(),
        );
    }

    Ok(extracted)
}

fn extract_docx_text(path: &Path) -> Result<String, String> {
    let file = File::open(path)
        .with_context(|| format!("Failed to open document: {}", path.display()))
        .map_err(|err| err.to_string())?;

    let mut archive =
        ZipArchive::new(file).map_err(|err| format!("Failed to read .docx archive: {err}"))?;
    let mut document_xml = String::new();

    archive
        .by_name("word/document.xml")
        .map_err(|_| "Could not find word/document.xml in .docx file.".to_string())?
        .read_to_string(&mut document_xml)
        .map_err(|err| format!("Failed to read .docx XML content: {err}"))?;

    let mut reader = Reader::from_str(&document_xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut extracted = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Text(text)) => {
                let decoded = text
                    .decode()
                    .map_err(|err| format!("Failed to decode .docx text: {err}"))?;
                if !decoded.trim().is_empty() {
                    extracted.push_str(&decoded);
                    extracted.push(' ');
                }
            }
            Ok(Event::End(tag)) if tag.name().as_ref() == b"w:p" => {
                extracted.push('\n');
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(err) => return Err(format!("Failed to parse .docx XML: {err}")),
        }
        buf.clear();
    }

    if extracted.trim().is_empty() {
        return Err("No readable text found in .docx document.".to_string());
    }

    Ok(extracted)
}

fn extract_doc_text(path: &Path) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("textutil")
            .args(["-convert", "txt", "-stdout"])
            .arg(path)
            .output()
            .map_err(|err| format!("Failed to run textutil for .doc extraction: {err}"))?;

        if !output.status.success() {
            return Err("Could not extract text from .doc with textutil.".to_string());
        }

        let extracted = String::from_utf8(output.stdout)
            .map_err(|_| "Extracted .doc text was not UTF-8.".to_string())?;

        if extracted.trim().is_empty() {
            return Err("No readable text found in .doc document.".to_string());
        }

        return Ok(extracted);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Legacy .doc extraction is currently supported on macOS only.".to_string())
    }
}

fn extract_document_text(path: &Path) -> Result<String, String> {
    match file_extension(path).as_str() {
        "pdf" => extract_pdf_text(path),
        "docx" => extract_docx_text(path),
        "doc" => extract_doc_text(path),
        _ => Err("Unsupported document format.".to_string()),
    }
}

fn normalized_command(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn has_blocked_shell_syntax(command: &str) -> bool {
    let blocked_tokens = ["&&", "||", ";", "|", "`", "$(", "\n", "\r", ">", "<"];
    blocked_tokens.iter().any(|token| command.contains(token))
}

fn has_forbidden_command_terms(command: &str) -> bool {
    let lowered = command.to_ascii_lowercase();
    let blocked_terms = [
        " rm ",
        " rm-",
        " rm/",
        "sudo",
        "shutdown",
        "reboot",
        "poweroff",
        "mkfs",
        "diskutil erase",
        "del /f",
        "format ",
    ];

    let padded = format!(" {} ", lowered);
    blocked_terms.iter().any(|term| padded.contains(term))
}

fn is_command_allowed(command: &str, allowed_prefixes: &[String]) -> bool {
    let normalized = normalized_command(command).to_ascii_lowercase();

    allowed_prefixes.iter().any(|prefix| {
        let expected = normalized_command(prefix).to_ascii_lowercase();
        normalized == expected || normalized.starts_with(&format!("{expected} "))
    })
}

fn first_command_token(command: &str) -> String {
    command.split_whitespace().next().unwrap_or("").to_string()
}

fn resolve_read_path(path: &str, allowed_root: Option<&str>) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path).map_err(|_| format!("Cannot access file: {path}"))?;

    if let Some(root) = allowed_root {
        let root_canonical =
            fs::canonicalize(root).map_err(|_| format!("Invalid allowed root: {root}"))?;
        if !canonical.starts_with(&root_canonical) {
            return Err(
                "Permission denied: file is outside the allowed project scope.".to_string(),
            );
        }
    }

    Ok(canonical)
}

fn resolve_write_path(path: &str, allowed_root: Option<&str>) -> Result<PathBuf, String> {
    let target = PathBuf::from(path);

    let candidate = if target.exists() {
        fs::canonicalize(&target).map_err(|_| format!("Cannot access file: {path}"))?
    } else {
        // Allow writing new files inside existing directories. We do not create directories here.
        // This keeps regular "save file" behavior strict while supporting safe path checks.
        let mut cursor = target.parent();
        let mut existing_ancestor: Option<PathBuf> = None;
        while let Some(path) = cursor {
            if path.exists() {
                existing_ancestor = Some(path.to_path_buf());
                break;
            }
            cursor = path.parent();
        }

        let ancestor = existing_ancestor.ok_or_else(|| {
            let parent_display = target
                .parent()
                .map(|value| value.display().to_string())
                .unwrap_or_else(|| ".".to_string());
            format!("Cannot access target directory: {parent_display}")
        })?;

        let canonical_ancestor = fs::canonicalize(&ancestor)
            .map_err(|_| format!("Cannot access target directory: {}", ancestor.display()))?;
        canonical_ancestor.join(
            target
                .file_name()
                .ok_or_else(|| "Invalid target file name.".to_string())?,
        )
    };

    if let Some(root) = allowed_root {
        let root_canonical =
            fs::canonicalize(root).map_err(|_| format!("Invalid allowed root: {root}"))?;
        if !candidate.starts_with(&root_canonical) {
            return Err(
                "Permission denied: write is outside the allowed project scope.".to_string(),
            );
        }
    }

    Ok(candidate)
}

fn sanitize_relative_path(relative_path: &str) -> Result<String, String> {
    let normalized = relative_path.replace('\\', "/").trim().to_string();
    if normalized.is_empty() {
        return Err("Relative path cannot be empty.".to_string());
    }

    if normalized.starts_with('/') || normalized.contains(':') {
        return Err("File operation path must be relative to the project root.".to_string());
    }

    if normalized == "." {
        return Err("File operation path must point to a file.".to_string());
    }

    let parts = normalized.split('/').collect::<Vec<_>>();
    if parts.iter().any(|part| *part == ".." || *part == ".") {
        return Err("Path traversal is not allowed in file operations.".to_string());
    }

    Ok(normalized.trim_start_matches("./").to_string())
}

fn resolve_relative_target_path(
    project_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let safe_relative = sanitize_relative_path(relative_path)?;
    let target = project_root.join(&safe_relative);

    if target.exists() {
        let canonical_target = fs::canonicalize(&target)
            .map_err(|_| format!("Cannot access file: {}", target.display()))?;
        if !canonical_target.starts_with(project_root) {
            return Err("Permission denied: operation outside project root.".to_string());
        }
        return Ok(canonical_target);
    }

    // For new paths, canonicalize the nearest existing ancestor to prevent symlink escape,
    // while still allowing creation of nested directories that do not yet exist.
    let mut cursor = target.parent();
    let mut existing_ancestor: Option<PathBuf> = None;
    while let Some(path) = cursor {
        if path.exists() {
            existing_ancestor = Some(path.to_path_buf());
            break;
        }
        cursor = path.parent();
    }

    let ancestor = existing_ancestor
        .ok_or_else(|| format!("Cannot access target directory: {}", project_root.display()))?;
    let canonical_ancestor = fs::canonicalize(&ancestor)
        .map_err(|_| format!("Cannot access target directory: {}", ancestor.display()))?;

    if !canonical_ancestor.starts_with(project_root) {
        return Err("Permission denied: operation outside project root.".to_string());
    }

    Ok(target)
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(1024).any(|byte| *byte == 0)
}

fn to_display_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn build_tree(
    current: &Path,
    root: &Path,
    ignored: &HashSet<String>,
    max_file_size_bytes: u64,
    files: &mut Vec<ScannedFile>,
    skipped_entries: &mut usize,
) -> Result<FileNode, String> {
    let name = current
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| to_display_path(current));

    let mut children: Vec<FileNode> = Vec::new();

    let mut entries = fs::read_dir(current)
        .map_err(|err| format!("Failed to read directory {}: {err}", current.display()))?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();

    entries.sort_by_key(|entry| {
        entry
            .file_name()
            .to_string_lossy()
            .to_string()
            .to_ascii_lowercase()
    });

    for entry in entries {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let metadata = match entry.metadata() {
            Ok(value) => value,
            Err(_) => {
                *skipped_entries += 1;
                continue;
            }
        };

        if metadata.is_dir() {
            if ignored.contains(&file_name.to_ascii_lowercase()) {
                *skipped_entries += 1;
                continue;
            }

            let child = build_tree(
                &path,
                root,
                ignored,
                max_file_size_bytes,
                files,
                skipped_entries,
            )?;
            children.push(child);
            continue;
        }

        if !metadata.is_file() {
            *skipped_entries += 1;
            continue;
        }

        if !is_context_supported_file(&path) {
            *skipped_entries += 1;
            continue;
        }

        let size = metadata.len();
        if size > max_file_size_bytes {
            *skipped_entries += 1;
            continue;
        }

        let language = language_for_path(&path);
        let display_path = to_display_path(&path);

        let relative_path = path
            .strip_prefix(root)
            .map(|value| to_display_path(value))
            .unwrap_or_else(|_| display_path.clone());

        files.push(ScannedFile {
            path: display_path.clone(),
            relative_path,
            size,
            language: language.clone(),
        });

        children.push(FileNode {
            name: file_name,
            path: display_path,
            is_dir: false,
            children: None,
            size: Some(size),
            language: Some(language),
        });
    }

    children.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name
                .to_ascii_lowercase()
                .cmp(&b.name.to_ascii_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(FileNode {
        name,
        path: to_display_path(current),
        is_dir: true,
        children: Some(children),
        size: None,
        language: None,
    })
}

fn scan_project_blocking(
    root_path: String,
    ignored_folders: Vec<String>,
    max_file_size_bytes: u64,
) -> Result<ProjectScanResult, String> {
    let canonical_root = fs::canonicalize(&root_path)
        .map_err(|_| format!("Cannot access project path: {root_path}"))?;

    if !canonical_root.is_dir() {
        return Err("Selected project path is not a directory.".to_string());
    }

    let ignored_set = ignored_folders
        .into_iter()
        .map(|entry| entry.to_ascii_lowercase())
        .collect::<HashSet<_>>();

    let mut files = Vec::new();
    let mut skipped_entries = 0usize;

    let tree = build_tree(
        &canonical_root,
        &canonical_root,
        &ignored_set,
        max_file_size_bytes,
        &mut files,
        &mut skipped_entries,
    )?;

    Ok(ProjectScanResult {
        root_path: to_display_path(&canonical_root),
        tree,
        files,
        skipped_entries,
    })
}

fn emit_ollama_event(app: &AppHandle, payload: OllamaStreamEvent) {
    let _ = app.emit("ollama_stream", payload);
}

fn emit_ollama_pull_event(app: &AppHandle, payload: OllamaPullStreamEvent) {
    let _ = app.emit("ollama_pull_stream", payload);
}

fn emit_openrouter_event(app: &AppHandle, payload: OpenRouterStreamEvent) {
    let _ = app.emit("openrouter_stream", payload);
}

fn emit_codex_event(app: &AppHandle, payload: CodexStreamEvent) {
    let _ = app.emit("codex_stream", payload);
}

async fn stream_ollama_response(
    app: AppHandle,
    request: OllamaChatRequest,
    request_id: String,
) -> Result<(), String> {
    let endpoint = normalize_endpoint(&request.endpoint);
    let url = format!("{endpoint}/api/chat");

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .build()
        .map_err(|err| err.to_string())?;

    let mut user_message = json!({
        "role": "user",
        "content": request.user_prompt
    });

    if let Some(images) = request.images.as_ref().filter(|images| !images.is_empty()) {
        user_message["images"] = json!(images);
    }

    let payload = json!({
        "model": request.model,
        "stream": true,
        "messages": [
            { "role": "system", "content": request.system_prompt },
            user_message
        ],
        "options": {
            "temperature": request.temperature,
            "num_predict": request.max_tokens
        }
    });

    let response = client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|err| format!("Failed to reach Ollama endpoint: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "No response body".to_string());
        return Err(format!("Ollama request failed ({status}): {body}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut done = false;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|err| format!("Streaming error from Ollama: {err}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(index) = buffer.find('\n') {
            let line = buffer[..index].trim().to_string();
            buffer.drain(..=index);

            if line.is_empty() {
                continue;
            }

            let value: Value = serde_json::from_str(&line)
                .map_err(|err| format!("Failed to parse Ollama stream chunk: {err}"))?;

            if let Some(error) = value.get("error").and_then(|value| value.as_str()) {
                return Err(error.to_string());
            }

            let delta = value
                .get("message")
                .and_then(|value| value.get("content"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());

            let is_done = value
                .get("done")
                .and_then(|value| value.as_bool())
                .unwrap_or(false);

            emit_ollama_event(
                &app,
                OllamaStreamEvent {
                    request_id: request_id.clone(),
                    delta,
                    done: is_done,
                    error: None,
                },
            );

            if is_done {
                done = true;
                break;
            }
        }

        if done {
            break;
        }
    }

    if !done {
        emit_ollama_event(
            &app,
            OllamaStreamEvent {
                request_id,
                delta: None,
                done: true,
                error: None,
            },
        );
    }

    Ok(())
}

async fn stream_openrouter_response(
    app: AppHandle,
    request: OpenRouterChatRequest,
    request_id: String,
) -> Result<(), String> {
    let endpoint = normalize_endpoint(&request.endpoint);
    let api_key = request.api_key.trim().to_string();
    let model = request.model.trim().to_string();

    if endpoint.is_empty() {
        return Err("OpenRouter endpoint is missing.".to_string());
    }

    if api_key.is_empty() {
        return Err("OpenRouter API key is missing.".to_string());
    }

    if model.is_empty() {
        return Err("OpenRouter model is missing.".to_string());
    }

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(6))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|err| err.to_string())?;

    let payload = json!({
        "model": model,
        "stream": true,
        "messages": [
            { "role": "system", "content": request.system_prompt },
            { "role": "user", "content": request.user_prompt }
        ],
        "temperature": request.temperature,
        "max_tokens": request.max_tokens
    });

    let response = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://local-code-assistant.app")
        .header("X-Title", "Local Code Assistant")
        .json(&payload)
        .send()
        .await
        .map_err(|err| format!("Failed to reach OpenRouter endpoint: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "No response body".to_string());
        return Err(format!("OpenRouter request failed ({status}): {body}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut done = false;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|err| format!("Streaming error from OpenRouter: {err}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(index) = buffer.find('\n') {
            let line = buffer[..index].trim().to_string();
            buffer.drain(..=index);

            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }

            let data = line["data:".len()..].trim();
            if data.is_empty() {
                continue;
            }

            if data == "[DONE]" {
                emit_openrouter_event(
                    &app,
                    OpenRouterStreamEvent {
                        request_id: request_id.clone(),
                        delta: None,
                        done: true,
                        error: None,
                    },
                );
                done = true;
                break;
            }

            let value: Value = serde_json::from_str(data)
                .map_err(|err| format!("Failed to parse OpenRouter stream chunk: {err}"))?;

            if let Some(error_message) = value
                .get("error")
                .and_then(|error| {
                    error
                        .get("message")
                        .and_then(|message| message.as_str())
                        .or_else(|| error.as_str())
                })
            {
                return Err(error_message.to_string());
            }

            let delta = value
                .get("choices")
                .and_then(|choices| choices.as_array())
                .and_then(|choices| choices.first())
                .and_then(|choice| choice.get("delta"))
                .and_then(|delta| delta.get("content"))
                .and_then(|content| content.as_str())
                .map(|content| content.to_string());

            let is_done = value
                .get("choices")
                .and_then(|choices| choices.as_array())
                .and_then(|choices| choices.first())
                .and_then(|choice| choice.get("finish_reason"))
                .map(|finish| !finish.is_null())
                .unwrap_or(false);

            if delta.is_some() || is_done {
                emit_openrouter_event(
                    &app,
                    OpenRouterStreamEvent {
                        request_id: request_id.clone(),
                        delta,
                        done: is_done,
                        error: None,
                    },
                );
            }

            if is_done {
                done = true;
                break;
            }
        }

        if done {
            break;
        }
    }

    if !done {
        emit_openrouter_event(
            &app,
            OpenRouterStreamEvent {
                request_id,
                delta: None,
                done: true,
                error: None,
            },
        );
    }

    Ok(())
}

async fn stream_ollama_pull(
    app: AppHandle,
    endpoint: String,
    model: String,
    request_id: String,
) -> Result<(), String> {
    let normalized = normalize_endpoint(&endpoint);
    let trimmed_model = model.trim().to_string();
    if trimmed_model.is_empty() {
        return Err("Model name cannot be empty.".to_string());
    }

    let url = format!("{normalized}/api/pull");

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(60 * 60))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .post(url)
        .json(&json!({
            "model": trimmed_model,
            "stream": true
        }))
        .send()
        .await
        .map_err(|err| format!("Failed to reach Ollama endpoint: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "No response body".to_string());
        return Err(format!("Ollama pull failed ({status}): {body}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut done = false;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|err| format!("Streaming error from Ollama: {err}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(index) = buffer.find('\n') {
            let line = buffer[..index].trim().to_string();
            buffer.drain(..=index);

            if line.is_empty() {
                continue;
            }

            let value: Value = serde_json::from_str(&line)
                .map_err(|err| format!("Failed to parse Ollama pull stream chunk: {err}"))?;

            if let Some(error) = value.get("error").and_then(|value| value.as_str()) {
                return Err(error.to_string());
            }

            let status = value
                .get("status")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            let completed = value.get("completed").and_then(|value| value.as_u64());
            let total = value.get("total").and_then(|value| value.as_u64());
            let percent = match (completed, total) {
                (Some(completed_value), Some(total_value)) if total_value > 0 => {
                    Some((completed_value as f64 / total_value as f64) * 100.0)
                }
                _ => None,
            };

            let status_done = status
                .as_deref()
                .map(|text| {
                    let lowered = text.to_ascii_lowercase();
                    lowered.contains("success")
                        || lowered.contains("already exists")
                        || lowered.contains("completed")
                })
                .unwrap_or(false);

            let is_done = value
                .get("done")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
                || status_done;

            emit_ollama_pull_event(
                &app,
                OllamaPullStreamEvent {
                    request_id: request_id.clone(),
                    model: trimmed_model.clone(),
                    status,
                    completed,
                    total,
                    percent,
                    done: is_done,
                    error: None,
                },
            );

            if is_done {
                done = true;
                break;
            }
        }

        if done {
            break;
        }
    }

    if !done {
        emit_ollama_pull_event(
            &app,
            OllamaPullStreamEvent {
                request_id,
                model: trimmed_model,
                status: Some("Pull completed.".to_string()),
                completed: None,
                total: None,
                percent: Some(100.0),
                done: true,
                error: None,
            },
        );
    }

    Ok(())
}

fn first_non_empty_line(input: &str) -> Option<String> {
    input
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

fn human_status_for_codex_event(event_type: &str) -> Option<&'static str> {
    match event_type {
        "thread.started" => Some("Session started."),
        "turn.started" => Some("Generating response..."),
        "turn.completed" => Some("Response complete."),
        _ => None,
    }
}

async fn stream_codex_response(
    app: AppHandle,
    request: CodexChatRequest,
    request_id: String,
) -> Result<(), String> {
    let codex_binary = locate_codex_binary()
        .ok_or_else(|| "Codex CLI was not detected locally. Install Codex CLI first.".to_string())?;

    let mut command = AsyncCommand::new(&codex_binary);
    command
        .arg("exec")
        .arg("--json")
        .arg("--skip-git-repo-check")
        .arg("--sandbox")
        .arg("read-only");

    if let Some(profile) = request.profile.as_deref().map(str::trim).filter(|value| !value.is_empty())
    {
        command.arg("-p").arg(profile);
    }

    if let Some(model) = request.model.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        command.arg("-m").arg(model);
    }

    if let Some(project_root) = request
        .project_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.arg("-C").arg(project_root);
    }

    let merged_prompt = format!(
        "{}\n\n{}",
        request.system_prompt.trim(),
        request.user_prompt.trim()
    );
    command.arg(merged_prompt);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    emit_codex_event(
        &app,
        CodexStreamEvent {
            request_id: request_id.clone(),
            delta: None,
            status: Some("Starting Codex...".to_string()),
            done: false,
            error: None,
        },
    );

    let output = timeout(Duration::from_secs(600), command.output())
        .await
        .map_err(|_| "Codex request timed out after 10 minutes.".to_string())?
        .map_err(|err| format!("Failed to run Codex CLI: {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let mut has_emitted_answer = false;
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed = match serde_json::from_str::<Value>(trimmed) {
            Ok(value) => value,
            Err(_) => {
                // Codex can print non-JSON warnings, especially during plugin sync.
                continue;
            }
        };

        let event_type = parsed
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or_default();

        if let Some(status) = human_status_for_codex_event(event_type) {
            emit_codex_event(
                &app,
                CodexStreamEvent {
                    request_id: request_id.clone(),
                    delta: None,
                    status: Some(status.to_string()),
                    done: false,
                    error: None,
                },
            );
            continue;
        }

        if event_type == "item.completed" {
            let item = parsed.get("item");
            let item_type = item
                .and_then(|value| value.get("type"))
                .and_then(|value| value.as_str())
                .unwrap_or_default();

            if item_type == "agent_message" {
                if let Some(text) = item
                    .and_then(|value| value.get("text"))
                    .and_then(|value| value.as_str())
                {
                    if !text.trim().is_empty() {
                        has_emitted_answer = true;
                        emit_codex_event(
                            &app,
                            CodexStreamEvent {
                                request_id: request_id.clone(),
                                delta: Some(text.to_string()),
                                status: None,
                                done: false,
                                error: None,
                            },
                        );
                    }
                }
            }
        }
    }

    if !output.status.success() {
        let error_line = first_non_empty_line(&stderr)
            .or_else(|| first_non_empty_line(&stdout))
            .unwrap_or_else(|| "Codex command failed.".to_string());
        return Err(format!("Codex execution failed: {error_line}"));
    }

    if !has_emitted_answer {
        return Err("Codex completed but did not return an assistant message.".to_string());
    }

    emit_codex_event(
        &app,
        CodexStreamEvent {
            request_id,
            delta: None,
            status: None,
            done: true,
            error: None,
        },
    );

    Ok(())
}

#[tauri::command]
fn load_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let conn = open_db(&state.db_path)?;

    let mut stmt = conn
        .prepare("SELECT data FROM app_settings WHERE id = 1")
        .map_err(|err| err.to_string())?;

    let row = stmt.query_row([], |row| row.get::<_, String>(0));

    match row {
        Ok(data) => match serde_json::from_str(&data) {
            Ok(settings) => Ok(settings),
            Err(_) => Ok(default_settings()),
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(default_settings()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn save_settings(state: State<AppState>, settings: AppSettings) -> Result<(), String> {
    let conn = open_db(&state.db_path)?;
    let payload = serde_json::to_string(&settings).map_err(|err| err.to_string())?;

    conn.execute(
        r#"
        INSERT INTO app_settings (id, data)
        VALUES (1, ?1)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data
        "#,
        [payload],
    )
    .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_chat_history(
    state: State<AppState>,
    project_path: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ChatMessage>, String> {
    let conn = open_db(&state.db_path)?;
    let safe_limit = limit.unwrap_or(200).clamp(1, 2000);

    let mut messages = Vec::new();

    if let Some(path) = project_path {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, role, content, created_at, project_path, metadata_json
                FROM chat_messages
                WHERE project_path = ?1
                ORDER BY created_at ASC
                LIMIT ?2
                "#,
            )
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map(params![path, safe_limit], |row| {
                let metadata_json: Option<String> = row.get(5)?;
                let metadata = metadata_json
                    .as_deref()
                    .and_then(|text| serde_json::from_str::<Value>(text).ok());

                Ok(ChatMessage {
                    id: row.get(0)?,
                    role: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                    project_path: row.get(4)?,
                    metadata,
                })
            })
            .map_err(|err| err.to_string())?;

        for row in rows {
            messages.push(row.map_err(|err| err.to_string())?);
        }

        return Ok(messages);
    }

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, role, content, created_at, project_path, metadata_json
            FROM chat_messages
            WHERE project_path IS NULL
            ORDER BY created_at ASC
            LIMIT ?1
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map(params![safe_limit], |row| {
            let metadata_json: Option<String> = row.get(5)?;
            let metadata = metadata_json
                .as_deref()
                .and_then(|text| serde_json::from_str::<Value>(text).ok());

            Ok(ChatMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                project_path: row.get(4)?,
                metadata,
            })
        })
        .map_err(|err| err.to_string())?;

    for row in rows {
        messages.push(row.map_err(|err| err.to_string())?);
    }

    Ok(messages)
}

#[tauri::command]
fn append_chat_message(state: State<AppState>, message: ChatMessage) -> Result<(), String> {
    let conn = open_db(&state.db_path)?;
    let metadata_json = message
        .metadata
        .as_ref()
        .map(|value| serde_json::to_string(value).unwrap_or_else(|_| "null".to_string()));

    conn.execute(
        r#"
        INSERT INTO chat_messages (id, role, content, created_at, project_path, metadata_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET
          role = excluded.role,
          content = excluded.content,
          created_at = excluded.created_at,
          project_path = excluded.project_path,
          metadata_json = excluded.metadata_json
        "#,
        params![
            message.id,
            message.role,
            message.content,
            if message.created_at.trim().is_empty() {
                now_iso()
            } else {
                message.created_at
            },
            message.project_path,
            metadata_json
        ],
    )
    .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
fn clear_chat_history(state: State<AppState>, project_path: Option<String>) -> Result<(), String> {
    let conn = open_db(&state.db_path)?;

    if let Some(path) = project_path {
        conn.execute("DELETE FROM chat_messages WHERE project_path = ?1", [path])
            .map_err(|err| err.to_string())?;
    } else {
        conn.execute("DELETE FROM chat_messages WHERE project_path IS NULL", [])
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn load_recent_projects(state: State<AppState>) -> Result<Vec<RecentProject>, String> {
    let conn = open_db(&state.db_path)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT path, opened_at
            FROM recent_projects
            ORDER BY opened_at DESC
            LIMIT 20
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RecentProject {
                path: row.get(0)?,
                opened_at: row.get(1)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut projects = Vec::new();
    for row in rows {
        projects.push(row.map_err(|err| err.to_string())?);
    }

    Ok(projects)
}

#[tauri::command]
fn add_recent_project(state: State<AppState>, path: String) -> Result<(), String> {
    let conn = open_db(&state.db_path)?;

    conn.execute(
        r#"
        INSERT INTO recent_projects(path, opened_at)
        VALUES (?1, ?2)
        ON CONFLICT(path) DO UPDATE SET opened_at = excluded.opened_at
        "#,
        params![path, now_iso()],
    )
    .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_project_session(
    state: State<AppState>,
    project_path: String,
) -> Result<Option<ProjectSession>, String> {
    let conn = open_db(&state.db_path)?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT project_path, metadata_json, updated_at
            FROM project_sessions
            WHERE project_path = ?1
            "#,
        )
        .map_err(|err| err.to_string())?;

    let row = stmt.query_row([project_path], |row| {
        Ok(ProjectSession {
            project_path: row.get(0)?,
            metadata_json: row.get(1)?,
            updated_at: row.get(2)?,
        })
    });

    match row {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn save_project_session(
    state: State<AppState>,
    project_path: String,
    metadata_json: String,
) -> Result<(), String> {
    let conn = open_db(&state.db_path)?;

    conn.execute(
        r#"
        INSERT INTO project_sessions(project_path, metadata_json, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(project_path) DO UPDATE SET
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        "#,
        params![project_path, metadata_json, now_iso()],
    )
    .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
async fn scan_project(
    root_path: String,
    ignored_folders: Vec<String>,
    max_file_size_bytes: Option<u64>,
) -> Result<ProjectScanResult, String> {
    let size_limit = max_file_size_bytes.unwrap_or(2_000_000);

    tokio::task::spawn_blocking(move || {
        scan_project_blocking(root_path, ignored_folders, size_limit)
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn read_text_file(
    path: String,
    allowed_root: Option<String>,
    max_bytes: Option<usize>,
) -> Result<TextFileResult, String> {
    let max_bytes = max_bytes.unwrap_or(1_500_000);

    tokio::task::spawn_blocking(move || {
        let resolved = resolve_read_path(&path, allowed_root.as_deref())?;
        let content = if is_document_file(&resolved) {
            extract_document_text(&resolved)?
        } else if is_image_file(&resolved) {
            return Err(
                "Images cannot be opened in the text editor. Add them as AI context instead."
                    .to_string(),
            );
        } else {
            read_utf8_text_file(&resolved, max_bytes)?
        };

        let size = content.len() as u64;
        let language = language_for_path(&resolved);

        Ok(TextFileResult {
            path: to_display_path(&resolved),
            content,
            size,
            language,
        })
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn read_context_file(
    path: String,
    allowed_root: Option<String>,
    max_bytes: Option<usize>,
    max_image_bytes: Option<usize>,
) -> Result<ContextFileResult, String> {
    let max_bytes = max_bytes.unwrap_or(1_500_000);
    let max_image_bytes = max_image_bytes.unwrap_or(5_000_000);

    tokio::task::spawn_blocking(move || {
        let resolved = resolve_read_path(&path, allowed_root.as_deref())?;
        if !is_context_supported_file(&resolved) {
            return Err("This file type is not supported for AI context yet.".to_string());
        }

        if is_image_file(&resolved) {
            let bytes = fs::read(&resolved)
                .with_context(|| format!("Failed to read image file: {}", resolved.display()))
                .map_err(|err| err.to_string())?;

            if bytes.len() > max_image_bytes {
                return Err(format!(
                    "Image is too large for context ({} bytes; max {}).",
                    bytes.len(),
                    max_image_bytes
                ));
            }

            let encoded = BASE64_STANDARD.encode(bytes);

            return Ok(ContextFileResult {
                path: to_display_path(&resolved),
                content: "Image attachment included for visual analysis.".to_string(),
                size: encoded.len() as u64,
                language: "image".to_string(),
                media_type: "image".to_string(),
                image_base64: Some(encoded),
            });
        }

        let content = if is_document_file(&resolved) {
            extract_document_text(&resolved)?
        } else {
            read_utf8_text_file(&resolved, max_bytes)?
        };

        let media_type = if is_document_file(&resolved) {
            "document".to_string()
        } else {
            "text".to_string()
        };

        Ok(ContextFileResult {
            path: to_display_path(&resolved),
            size: content.len() as u64,
            language: language_for_path(&resolved),
            media_type,
            content,
            image_base64: None,
        })
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn save_text_file(
    path: String,
    content: String,
    allowed_root: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let resolved = resolve_write_path(&path, allowed_root.as_deref())?;

        if !is_editor_text_file(&resolved) {
            return Err("Saving is blocked for this file type in the MVP scope.".to_string());
        }

        fs::write(&resolved, content)
            .with_context(|| format!("Failed to write file: {}", resolved.display()))
            .map_err(|err| err.to_string())?;

        Ok(())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn run_project_command(
    state: State<'_, AppState>,
    command: String,
    project_root: String,
    allowed_prefixes: Vec<String>,
    timeout_seconds: Option<u64>,
) -> Result<CommandRunResult, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Command cannot be empty.".to_string());
    }

    if trimmed.len() > 300 {
        return Err("Command is too long. Keep it under 300 characters.".to_string());
    }

    let conn = open_db(&state.db_path)?;
    let saved_settings_json = conn
        .query_row("SELECT data FROM app_settings WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .ok();

    let stored_settings = saved_settings_json
        .as_deref()
        .and_then(|json| serde_json::from_str::<AppSettings>(json).ok())
        .unwrap_or_else(default_settings);

    let full_access_mode = stored_settings.full_access_mode;

    if !stored_settings.command_execution_enabled && !full_access_mode {
        return Err(
            "Command execution is disabled in settings. Enable it first in Settings.".to_string(),
        );
    }

    if !stored_settings.allow_any_command && !full_access_mode {
        if has_blocked_shell_syntax(trimmed) {
            return Err("Blocked command syntax. Chaining, pipes, redirection, and substitutions are not allowed unless 'allow any command' is enabled.".to_string());
        }

        if has_forbidden_command_terms(trimmed) {
            return Err("This command contains blocked terms for safety.".to_string());
        }
    }

    let allowed = if allowed_prefixes.is_empty() {
        stored_settings.allowed_command_prefixes
    } else {
        allowed_prefixes
    };

    if !stored_settings.allow_any_command && !full_access_mode && !is_command_allowed(trimmed, &allowed) {
        let token = first_command_token(trimmed);
        return Err(format!(
            "Command is blocked by allowlist. Add prefix `{}` in Settings -> Allowed command prefixes.",
            token
        ));
    }

    let project_dir = fs::canonicalize(&project_root)
        .map_err(|_| format!("Cannot access project directory: {project_root}"))?;
    if !project_dir.is_dir() {
        return Err("Command execution requires a valid project directory.".to_string());
    }

    let shell_timeout = timeout_seconds.unwrap_or(120).clamp(5, 600);

    #[cfg(target_os = "windows")]
    let mut process = {
        let mut command = AsyncCommand::new("cmd");
        command.arg("/C").arg(trimmed);
        command
    };

    #[cfg(not(target_os = "windows"))]
    let mut process = {
        let mut command = AsyncCommand::new("/bin/zsh");
        command.arg("-lc").arg(trimmed);
        command
    };

    process
        .current_dir(&project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output_result = timeout(Duration::from_secs(shell_timeout), process.output()).await;

    let output = match output_result {
        Ok(Ok(value)) => value,
        Ok(Err(err)) => return Err(format!("Failed to execute command: {err}")),
        Err(_) => {
            return Ok(CommandRunResult {
                command: trimmed.to_string(),
                cwd: to_display_path(&project_dir),
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                timed_out: true,
            });
        }
    };

    let mut stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let max_output_chars = 24_000usize;
    if stdout.len() > max_output_chars {
        stdout = format!("{}\n\n[output truncated]", &stdout[..max_output_chars]);
    }

    if stderr.len() > max_output_chars {
        stderr = format!(
            "{}\n\n[error output truncated]",
            &stderr[..max_output_chars]
        );
    }

    Ok(CommandRunResult {
        command: trimmed.to_string(),
        cwd: to_display_path(&project_dir),
        exit_code: output.status.code(),
        stdout,
        stderr,
        timed_out: false,
    })
}

#[tauri::command]
async fn apply_file_operations(
    project_root: String,
    operations: Vec<FileOperationInput>,
) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        if operations.is_empty() {
            return Ok(Vec::new());
        }

        if operations.len() > 80 {
            return Err("Too many file operations in one batch. Limit is 80.".to_string());
        }

        let canonical_root = fs::canonicalize(&project_root)
            .map_err(|_| format!("Cannot access project root: {project_root}"))?;
        if !canonical_root.is_dir() {
            return Err("Project root must be a directory.".to_string());
        }

        let mut total_content_size = 0usize;
        for operation in &operations {
            if let Some(content) = operation.content.as_ref() {
                if content.len() > 600_000 {
                    return Err(format!(
                        "File operation content is too large for {} (max 600000 chars).",
                        operation.relative_path
                    ));
                }
                total_content_size += content.len();
            }
        }

        if total_content_size > 2_500_000 {
            return Err(
                "Total operation content is too large for one apply (max 2500000 chars)."
                    .to_string(),
            );
        }

        let mut applied_paths = Vec::new();

        for operation in operations {
            let action = operation.action.trim().to_ascii_lowercase();
            let resolved = resolve_relative_target_path(&canonical_root, &operation.relative_path)?;

            match action.as_str() {
                "create" => {
                    let content = operation
                        .content
                        .ok_or_else(|| "Create operation requires file content.".to_string())?;
                    if let Some(parent) = resolved.parent() {
                        fs::create_dir_all(parent).map_err(|err| {
                            format!("Failed to create directory {}: {err}", parent.display())
                        })?;
                    }
                    fs::write(&resolved, content).map_err(|err| {
                        format!("Failed to create file {}: {err}", resolved.display())
                    })?;
                    applied_paths.push(to_display_path(&resolved));
                }
                "update" => {
                    let content = operation
                        .content
                        .ok_or_else(|| "Update operation requires file content.".to_string())?;
                    if let Some(parent) = resolved.parent() {
                        fs::create_dir_all(parent).map_err(|err| {
                            format!("Failed to create directory {}: {err}", parent.display())
                        })?;
                    }
                    fs::write(&resolved, content).map_err(|err| {
                        format!("Failed to update file {}: {err}", resolved.display())
                    })?;
                    applied_paths.push(to_display_path(&resolved));
                }
                "delete" => {
                    if resolved.exists() {
                        fs::remove_file(&resolved).map_err(|err| {
                            format!("Failed to delete file {}: {err}", resolved.display())
                        })?;
                        applied_paths.push(to_display_path(&resolved));
                    }
                }
                _ => {
                    return Err(format!(
                        "Unsupported file operation action: {}",
                        operation.action
                    ));
                }
            }
        }

        Ok(applied_paths)
    })
    .await
    .map_err(|err| err.to_string())?
}

fn candidate_ollama_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(path) = env::var("OLLAMA_PATH") {
        candidates.push(PathBuf::from(path));
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/opt/homebrew/bin/ollama"));
        candidates.push(PathBuf::from("/usr/local/bin/ollama"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
        if let Ok(program_files) = env::var("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        candidates.push(PathBuf::from("/usr/local/bin/ollama"));
        candidates.push(PathBuf::from("/usr/bin/ollama"));
    }

    candidates
}

fn locate_ollama_binary() -> Option<PathBuf> {
    for path in candidate_ollama_paths() {
        if path.exists() {
            return Some(path);
        }
    }

    let in_path = Command::new("ollama")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if in_path {
        Some(PathBuf::from("ollama"))
    } else {
        None
    }
}

fn candidate_codex_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(path) = env::var("CODEX_PATH") {
        candidates.push(PathBuf::from(path));
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/opt/homebrew/bin/codex"));
        candidates.push(PathBuf::from("/usr/local/bin/codex"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("Codex")
                    .join("codex.exe"),
            );
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        candidates.push(PathBuf::from("/usr/local/bin/codex"));
        candidates.push(PathBuf::from("/usr/bin/codex"));
    }

    candidates
}

fn locate_codex_binary() -> Option<PathBuf> {
    for path in candidate_codex_paths() {
        if path.exists() {
            return Some(path);
        }
    }

    let in_path = Command::new("codex")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if in_path {
        Some(PathBuf::from("codex"))
    } else {
        None
    }
}

async fn is_ollama_reachable(endpoint: &str) -> bool {
    let client = match Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(4))
        .build()
    {
        Ok(value) => value,
        Err(_) => return false,
    };

    client
        .get(format!("{endpoint}/api/tags"))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

#[tauri::command]
async fn ollama_status(endpoint: String) -> Result<OllamaStatus, String> {
    let normalized = normalize_endpoint(&endpoint);
    let detected_path = locate_ollama_binary();
    let installed = detected_path.is_some();
    let running = is_ollama_reachable(&normalized).await;
    let rendered_path = detected_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());

    let message = if !installed && !running {
        "Ollama is not installed.".to_string()
    } else if !installed && running {
        "An Ollama endpoint is reachable, but a local Ollama binary was not detected.".to_string()
    } else if !running {
        "Ollama is installed but not reachable at the configured endpoint.".to_string()
    } else {
        "Ollama is installed and reachable.".to_string()
    };

    Ok(OllamaStatus {
        installed,
        running,
        message,
        detected_path: rendered_path,
    })
}

#[tauri::command]
fn codex_status() -> Result<CodexStatus, String> {
    let detected_path = locate_codex_binary();
    let installed = detected_path.is_some();
    let rendered_path = detected_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());

    let message = if installed {
        "Codex CLI is available.".to_string()
    } else {
        "Codex CLI is not installed.".to_string()
    };

    Ok(CodexStatus {
        installed,
        message,
        detected_path: rendered_path,
    })
}

#[tauri::command]
fn install_ollama() -> Result<String, String> {
    let url = "https://ollama.com/download";

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Failed to open Ollama download page: {err}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|err| format!("Failed to open Ollama download page: {err}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Failed to open Ollama download page: {err}"))?;
    }

    Ok("Opened Ollama download page.".to_string())
}

#[tauri::command]
fn install_codex_cli() -> Result<String, String> {
    let url = "https://github.com/openai/codex#installation";

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Failed to open Codex install page: {err}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|err| format!("Failed to open Codex install page: {err}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Failed to open Codex install page: {err}"))?;
    }

    Ok("Opened Codex CLI installation guide.".to_string())
}

#[tauri::command]
async fn start_ollama(endpoint: String) -> Result<String, String> {
    let normalized = normalize_endpoint(&endpoint);

    if is_ollama_reachable(&normalized).await {
        return Ok("Ollama is already running.".to_string());
    }

    let binary = locate_ollama_binary()
        .ok_or_else(|| "Ollama was not detected locally. Install Ollama first.".to_string())?;

    Command::new(&binary)
        .arg("serve")
        .spawn()
        .map_err(|err| format!("Failed to start Ollama from {}: {err}", binary.display()))?;

    for _ in 0..12 {
        sleep(Duration::from_millis(500)).await;
        if is_ollama_reachable(&normalized).await {
            return Ok("Ollama started successfully.".to_string());
        }
    }

    Ok("Ollama launch was triggered. It may still be starting up.".to_string())
}

#[tauri::command]
async fn ollama_list_models(endpoint: String) -> Result<Vec<OllamaModel>, String> {
    let normalized = normalize_endpoint(&endpoint);
    let url = format!("{normalized}/api/tags");

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("Failed to reach Ollama: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch models from Ollama (status {}).",
            response.status()
        ));
    }

    let parsed: OllamaTagsResponse = response
        .json()
        .await
        .map_err(|err| format!("Invalid model response from Ollama: {err}"))?;

    Ok(parsed.models)
}

fn is_model_name_char(ch: char) -> bool {
    ch.is_ascii_lowercase()
        || ch.is_ascii_digit()
        || ch == '-'
        || ch == '_'
        || ch == '.'
        || ch == ':'
}

fn extract_registry_model_names(html: &str, query_lower: &str, limit: usize) -> Vec<String> {
    let mut results = Vec::new();
    let mut seen = HashSet::new();

    for (index, _) in html.match_indices("/library/") {
        let mut name = String::new();
        for ch in html[index + "/library/".len()..].chars() {
            if is_model_name_char(ch) {
                name.push(ch);
            } else {
                break;
            }
        }

        if name.is_empty() || name == "library" || name == "models" || name == "search" {
            continue;
        }

        if !query_lower.is_empty() && !name.to_ascii_lowercase().contains(query_lower) {
            continue;
        }

        if seen.insert(name.clone()) {
            results.push(name);
            if results.len() >= limit {
                break;
            }
        }
    }

    results
}

#[tauri::command]
async fn ollama_search_models(query: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let query_trimmed = query.trim().to_string();
    let query_lower = query_trimmed.to_ascii_lowercase();
    let safe_limit = limit.unwrap_or(120).clamp(5, 400);

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|err| err.to_string())?;

    let sources = [
        "https://registry.ollama.ai/search",
        "https://registry.ollama.ai/models",
        "https://registry.ollama.ai/library",
    ];

    let mut merged = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();

    for source in sources {
        let response = client
            .get(source)
            .query(&[("q", query_trimmed.as_str())])
            .send()
            .await
            .map_err(|err| format!("Failed to reach Ollama model registry: {err}"))?;

        if !response.status().is_success() {
            continue;
        }

        let body = response
            .text()
            .await
            .map_err(|err| format!("Invalid response from Ollama model registry: {err}"))?;

        let names = extract_registry_model_names(&body, &query_lower, safe_limit);
        for name in names {
            if seen.insert(name.clone()) {
                merged.push(name);
                if merged.len() >= safe_limit {
                    break;
                }
            }
        }

        if merged.len() >= safe_limit {
            break;
        }
    }

    if merged.is_empty() {
        return Err(
            "No models found from the Ollama registry right now. Try a different search."
                .to_string(),
        );
    }

    Ok(merged)
}

#[tauri::command]
async fn start_ollama_chat(
    app: AppHandle,
    request: OllamaChatRequest,
    request_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = stream_ollama_response(app.clone(), request, request_id.clone()).await {
            emit_ollama_event(
                &app,
                OllamaStreamEvent {
                    request_id,
                    delta: None,
                    done: true,
                    error: Some(error),
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
async fn start_openrouter_chat(
    app: AppHandle,
    request: OpenRouterChatRequest,
    request_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        if let Err(error) =
            stream_openrouter_response(app.clone(), request, request_id.clone()).await
        {
            emit_openrouter_event(
                &app,
                OpenRouterStreamEvent {
                    request_id,
                    delta: None,
                    done: true,
                    error: Some(error),
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
async fn start_codex_chat(
    app: AppHandle,
    request: CodexChatRequest,
    request_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = stream_codex_response(app.clone(), request, request_id.clone()).await {
            emit_codex_event(
                &app,
                CodexStreamEvent {
                    request_id,
                    delta: None,
                    status: None,
                    done: true,
                    error: Some(error),
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
async fn start_ollama_pull(
    app: AppHandle,
    endpoint: String,
    model: String,
    request_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        if let Err(error) =
            stream_ollama_pull(app.clone(), endpoint, model.clone(), request_id.clone()).await
        {
            emit_ollama_pull_event(
                &app,
                OllamaPullStreamEvent {
                    request_id,
                    model,
                    status: None,
                    completed: None,
                    total: None,
                    percent: None,
                    done: true,
                    error: Some(error),
                },
            );
        }
    });

    Ok(())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| err.to_string())
        .map(|dir| dir.join("local-code-assistant"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            let data_dir = app_data_dir(&app_handle)?;
            fs::create_dir_all(&data_dir)
                .with_context(|| {
                    format!(
                        "Failed to create app data directory: {}",
                        data_dir.display()
                    )
                })
                .map_err(|err| anyhow!(err).to_string())?;

            let db_path = data_dir.join("assistant.db");
            init_db_schema(&db_path)?;

            app.manage(AppState { db_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            load_chat_history,
            append_chat_message,
            clear_chat_history,
            load_recent_projects,
            add_recent_project,
            load_project_session,
            save_project_session,
            scan_project,
            read_text_file,
            read_context_file,
            save_text_file,
            run_project_command,
            apply_file_operations,
            ollama_status,
            ollama_list_models,
            ollama_search_models,
            install_ollama,
            start_ollama,
            start_openrouter_chat,
            start_ollama_chat,
            start_ollama_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
