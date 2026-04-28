# Local Code Assistant

Local Code Assistant is a desktop AI coding app for **macOS** and **Windows**.

It helps developers write, understand, and improve code with a clean mini-IDE interface.

## What The App Does

- AI chat for programming questions
- Code generation
- Code explanation
- Bug fixing and debugging suggestions
- Refactor and test generation
- File summary and project summary
- Safe review of AI edits before applying
- Safe review of AI command suggestions before running

## Main Experience

- **Left panel:** project and file explorer
- **Center:** code editor with tabs
- **Right panel:** AI chat assistant
- **Settings:** behavior controls, context options, and theme

## Model Experience (Inside The App)

- Uses **OpenRouter** by default
- Uses one fixed model: `qwen/qwen3.5-9b`
- End users cannot switch provider or model in the UI
- API key is managed by the app build (`VITE_OPENROUTER_API_KEY`)

## Safety And Privacy

- Local-first by default
- No hidden cloud calls
- No telemetry
- AI file edits are never auto-applied
- AI command suggestions are never auto-run
- Users must approve risky actions explicitly

## Supported File Types

- Code and text files
- JSON, HTML, CSS, Markdown
- PDF documents
- DOCX documents (and limited DOC support on macOS)
- Images (model-dependent understanding)

## Typical User Flows

- Open a Python file and ask: “Explain this function”
- Select buggy code and click: “Fix selection”
- Open a project folder and ask: “Summarize this project”
- Generate tests for a file
- Review AI-proposed changes and accept/reject

## Notes

- Some features depend on the selected model’s capabilities.
- Image understanding quality depends on using a vision-capable model.
