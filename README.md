# Local Code Assistant (Tauri + Ollama)

A local-first, cross-platform AI coding desktop assistant for **Windows** and **macOS**.

It provides a mini-IDE experience with file/project browsing, Monaco editing, AI chat, context-aware code actions, project/file summarization, and a safe diff review flow before writing edits.

## Features (MVP)

- Desktop app built with **Tauri v2** (not browser-only)
- React + TypeScript + Vite frontend
- Monaco editor with tabs, syntax highlighting, selection tracking, and code actions
- Project explorer with ignored-folder support and file-level context selection
- Ollama integration with:
  - status checks (installed/running)
  - in-app onboarding actions (install/start/refresh)
  - local model listing
  - in-app model manager (search + download/pull + set active model)
  - streamed chat responses
  - configurable endpoint/model/temperature/max tokens
- Context ingestion for additional file types:
  - text/code files
  - PDF (`.pdf`)
  - Word (`.docx`, plus limited `.doc` extraction on macOS)
  - images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`) for vision-capable models
- Prompt orchestration templates for:
  - general chat
  - explain
  - debug/fix
  - refactor
  - test generation
  - file summary
  - project summary
- Suggested edit workflow with side-by-side diff preview and explicit accept/reject
- Suggested command workflow with explicit approve/reject before execution
- Multi-file file-operation workflow:
  - AI can propose `create` / `update` / `delete` operations in JSON
  - app shows full review panel
  - nothing is written until explicit user approval
- Local persistence via SQLite for:
  - app settings
  - chat history
  - recent projects
  - project session metadata hooks
- Security-first local behavior:
  - no telemetry
  - no hidden cloud calls
  - scoped file read/write validation
  - command execution is disabled by default and always requires explicit approval

## Tech Stack

- **Desktop:** Tauri v2 (Rust backend commands)
- **Frontend:** React + TypeScript + Vite
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **State:** Zustand
- **Styling:** Tailwind CSS
- **Persistence:** SQLite (`rusqlite` on Rust side)
- **Local AI runtime:** Ollama HTTP API
- **Layout:** resizable panes (`react-resizable-panels`)

## Project Structure

```text
src/
  ui/
    App.tsx
    layout/TopToolbar.tsx
  features/
    chat/ChatPanel.tsx
    editor/{EditorPane.tsx,DiffReviewPanel.tsx}
    projects/ProjectExplorer.tsx
    settings/SettingsModal.tsx
  services/
    ollama/client.ts
    prompts/templates.ts
    storage/commands.ts
    fileSystem.ts
    project/analysis.ts
  stores/
    chatStore.ts
    editorStore.ts
    projectStore.ts
    settingsStore.ts
  lib/
    constants.ts
    editor.ts
    languages.ts
    utils.ts
  types/index.ts

src-tauri/
  src/main.rs
  tauri.conf.json
  capabilities/default.json
```

## Prerequisites

### Common

- Node.js 20+
- npm 10+
- Rust toolchain (stable) with `cargo`
- Tauri build prerequisites

### macOS

- Xcode Command Line Tools
- Rust target for your architecture

### Windows

- Microsoft Visual Studio C++ Build Tools
- WebView2 runtime (normally present on modern Windows)

Tauri docs for platform prerequisites: https://tauri.app/start/prerequisites/

## Ollama Setup

1. Install Ollama:
   - https://ollama.com/download
2. Start Ollama service (varies by OS; desktop app usually starts it automatically).
3. Pull a model:

```bash
# fastest option for quick testing
ollama pull tinyllama:1.1b

# recommended coding model
ollama pull qwen2.5-coder:7b
# or for stronger machines
ollama pull qwen2.5-coder:14b
```

Default endpoint is `http://127.0.0.1:11434`.

## Install & Run (Development)

```bash
npm install
npm run tauri:dev
```

Useful checks:

```bash
npm run lint
npm run build
```

## Build for Production

### macOS (DMG + .app)

```bash
npm run tauri:build
```

Artifacts are generated under:

- `src-tauri/target/release/bundle/dmg/`
- `src-tauri/target/release/bundle/macos/`

### Windows (MSI)

Run on a Windows machine:

```powershell
npm run tauri:build
```

Artifacts:

- `src-tauri/target/release/bundle/msi/`

## Settings Available

- Model name
- Ollama endpoint
- In-app model search/download (saved locally by Ollama)
- Temperature
- Max tokens
- Include current file automatically
- Include selected text automatically
- Max files in context
- Context mode
- Theme (light/dark)
- Default ignored folders
- Enable command execution toggle
- Allow any command after manual approval (dangerous toggle)
- Allowed command prefixes allowlist
  - includes safe read-only defaults (`ls`, `pwd`, `cat`, `head`, `tail`, `rg`, `find`)

## Example User Flows

1. **Explain function in Python file**
   - Open file
   - Select code (optional)
   - Click `Explain selection` or ask in chat

2. **Fix buggy selection**
   - Select buggy code in editor
   - Click `Fix selection`
   - Review diff panel
   - Click `Accept & Apply`

3. **Summarize project**
   - Open folder
   - Optionally check files in explorer to include in context
   - Click `Summarize Project`

4. **Generate tests**
   - Select target code or keep file active
   - Click `Generate tests`
   - Review and optionally apply suggestion

5. **Review AI patch before writing**
   - Trigger `Fix`/`Refactor`/`Generate tests`
   - Diff modal appears
   - Accept writes to disk; reject discards

6. **Review multi-file plan before writing**
   - Ask for a broader change (for example: "update routes and tests")
   - Assistant responds with JSON file operations
   - Review panel shows each create/update/delete action
   - Accept applies all operations; reject discards all

7. **Analyze a PDF, DOCX, or image file**
   - Open a project
   - In Explorer, check the file in `Include this file in AI context`
   - Ask a chat question about the selected context
   - For images, use a vision-capable Ollama model

## Screenshot / Demo GIF Guidance

Capture at least:

1. Main layout with project explorer + editor + chat
2. Selection-based action usage (`Fix selection`)
3. Diff review modal with accept/reject
4. Settings modal with model + endpoint config
5. Project summary conversation in chat

Recommended tools:

- macOS: `Kap` / `CleanShot`
- Windows: `ScreenToGif`

## Security Notes

- Local-first by design
- No telemetry pipeline included
- No proprietary API dependency in core flow
- File access is validated in Rust commands
- No auto command execution feature enabled
- Command execution requires explicit approve/reject each time
- "Allow any command" mode is opt-in and should be used carefully

## Known Limitations (Current MVP)

- Monaco context menu actions are provided via action buttons (not custom native right-click menu extension yet).
- Project analysis is chunking/scanning based (vector DB intentionally deferred for V1).
- Legacy `.doc` extraction is best-effort and may fail depending on file contents.
- Image reasoning quality depends on the selected model; text-only models may ignore images.
- Shell command execution blocks chaining/pipes/redirection and uses allowlisted command prefixes unless `Allow any command` is enabled.

## Multi-file JSON Format

When requesting broad code changes, the assistant can return:

```json
{
  "fileOperations": [
    { "path": "src/new-file.ts", "action": "create", "content": "..." },
    { "path": "src/existing.ts", "action": "update", "content": "..." },
    { "path": "src/old.ts", "action": "delete" }
  ]
}
```

The app always shows a review panel before applying these operations.

## Future Improvements

- Conversation search
- Multi-model profiles
- Token/context estimation
- Enhanced markdown rendering and code-block controls in chat
- Keyboard shortcut system
- Drag-and-drop folder opening
- Multi-file AI edit plans with staged apply
- Optional vector index integration

## Offline Behavior

After local setup (dependencies + app build + Ollama model pull), inference and core assistant workflows run offline against local models.
