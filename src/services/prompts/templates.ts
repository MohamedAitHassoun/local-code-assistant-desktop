import type { ChatContextPayload, ContextFile } from "@/types";

function summarizeFiles(files: ContextFile[] | undefined): string {
  if (!files || files.length === 0) return "";

  const rendered = files
    .map(
      (file) =>
        `\n### File (${file.mediaType ?? "text"}): ${file.path}\n\n\`\`\`\n${file.content.slice(0, 8000)}\n\`\`\``
    )
    .join("\n");

  return `\n\nAdditional context files:${rendered}`;
}

function baseContext(payload: ChatContextPayload): string {
  const fileContext =
    payload.filePath && payload.fileContent
      ? `\nCurrent file: ${payload.filePath}\n\n\`\`\`\n${payload.fileContent.slice(0, 12000)}\n\`\`\``
      : "";

  const selectionContext = payload.selection
    ? `\nSelected code:\n\`\`\`\n${payload.selection}\n\`\`\``
    : "";

  const projectContext = payload.projectSummary
    ? `\nProject summary:\n${payload.projectSummary}`
    : "";

  const projectFileIndex = payload.projectFileIndex?.length
    ? `\nProject file index:\n${payload.projectFileIndex.join("\n")}`
    : "";

  return `${fileContext}${selectionContext}${projectContext}${projectFileIndex}${summarizeFiles(payload.selectedFiles)}`;
}

export function systemPromptForIntent(intent: ChatContextPayload["intent"]): string {
  switch (intent) {
    case "explain":
      return "You are a senior software mentor. Explain code clearly, identify intent, and mention edge cases in practical terms.";
    case "debug":
      return "You are a debugging specialist. Diagnose likely issues, list probable root causes, and provide concrete fixes.";
    case "refactor":
      return "You are a refactoring assistant. Improve readability, maintainability, and safety while preserving behavior.";
    case "tests":
      return "You are a testing assistant. Produce high-value tests with clear assumptions and edge cases. If a test command is helpful, include exactly one command in a fenced bash block.";
    case "file_summary":
      return "You summarize files for engineering teams. Focus on responsibilities, key functions, dependencies, and risks.";
    case "project_summary":
      return "You summarize software projects. Explain architecture, major modules, data flow, and potential technical debt.";
    case "fix":
      return "You are a bug-fix coding assistant. Return corrected code and brief rationale.";
    case "chat":
    default:
      return "You are a practical local coding assistant. Give accurate programming help with concise, actionable responses. When relevant, suggest one safe terminal command in a fenced bash block.";
  }
}

export function userPromptForIntent(payload: ChatContextPayload): string {
  const context = baseContext(payload);

  switch (payload.intent) {
    case "explain":
      return `Explain the code below in depth. Include: purpose, behavior, edge cases, and possible improvements.${context}\n\nUser question: ${payload.userPrompt}`;
    case "debug":
      return `Analyze and debug the following code or issue. Provide likely root causes and a prioritized fix plan.${context}\n\nUser issue: ${payload.userPrompt}`;
    case "refactor":
      return `Refactor the selected code while preserving behavior. Return improved code in a fenced code block and then explain changes.${context}\n\nIf you need to change multiple files, include a JSON block:\n\`\`\`json\n{"fileOperations":[{"path":"relative/path.ext","action":"update","content":"..."}]}\n\`\`\`\n\nRefactor request: ${payload.userPrompt}`;
    case "tests":
      return `Generate unit tests for the selected or current code. Return tests in a fenced code block.${context}\n\nIf tests require creating/updating files, include a JSON block:\n\`\`\`json\n{"fileOperations":[{"path":"tests/example.test.ts","action":"create","content":"..."}]}\n\`\`\`\n\nTest request: ${payload.userPrompt}`;
    case "file_summary":
      return `Summarize this file for a developer who just joined the project. Keep it structured and practical.${context}`;
    case "project_summary":
      return `Summarize this project. Include architecture, core modules, data flow, and improvement opportunities.${context}`;
    case "fix":
      return `Fix the selected code. Return ONLY the corrected code in a fenced code block followed by a short explanation.${context}\n\nIf multiple files must be changed, include a JSON block with file operations using actions create/update/delete and relative file paths.\n\nFix request: ${payload.userPrompt}`;
    case "chat":
    default:
      return `Answer this programming request with practical and accurate guidance.${context}\n\nIf changes across project files are needed, include a JSON block:\n\`\`\`json\n{"fileOperations":[{"path":"relative/path.ext","action":"update","content":"..."}]}\n\`\`\`\n\nUser request: ${payload.userPrompt}`;
  }
}
