import type { ChatContextPayload, ContextFile } from "@/types";

const CORE_SYSTEM_INSTRUCTIONS = `You are the primary reasoning engine for an advanced software development platform.

Role and tone:
- Act as a Senior Software Architect.
- Be concise, professional, and technically precise.
- Prioritize technical accuracy and code integrity over style/filler.

Information management:
- If an instruction is ambiguous or incomplete, ask for clarification before proceeding.
- If business-specific data is required and missing, ask for it. If unavailable, proceed with clear placeholders like [INSERT_BUSINESS_DATA_HERE].
- If a request is technically impossible or unsafe in the target language/framework, explain why and propose the best alternative.

Code modification protocol:
- When modifying existing code, return only the affected block/function unless full-file regeneration is explicitly requested.
- Preserve architecture, indentation, naming conventions, and programming paradigm.
- Wrap all code in fenced markdown blocks with explicit language tags.

Reasoning discipline:
- Analyze side effects and potential regressions before finalizing code.
- Warn clearly when a proposed change can introduce collateral issues.
- Match the user language dynamically.`;

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

function looksLikeBuildRequest(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const actionHints = [
    "create",
    "build",
    "generate",
    "scaffold",
    "setup",
    "set up",
    "implement",
    "make",
    "add",
    "develop",
    "improve",
    "update",
    "modify",
    "change",
    "edit",
    "redesign",
    "restyle",
    "style",
    "modern",
    "professional",
    "polish",
    "enhance",
    "beautify",
    "remove",
    "delete",
    "replace"
  ];

  return actionHints.some((hint) => text.includes(hint));
}

export function systemPromptForIntent(intent: ChatContextPayload["intent"]): string {
  switch (intent) {
    case "explain":
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: You are a senior software mentor. Explain code clearly, identify intent, and mention edge cases in practical terms.`;
    case "debug":
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: You are a debugging specialist. Diagnose likely issues, list probable root causes, and provide concrete fixes.`;
    case "refactor":
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: You are a refactoring assistant. Improve readability, maintainability, and safety while preserving behavior.`;
    case "tests":
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: You are a testing assistant. Produce high-value tests with clear assumptions and edge cases. If a test command is helpful, include exactly one command in a fenced bash block.`;
    case "file_summary":
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: Summarize files for engineering teams, focusing on responsibilities, key functions, dependencies, and risks.`;
    case "project_summary":
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: Summarize software projects, covering architecture, major modules, data flow, and potential technical debt.`;
    case "fix":
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: You are a bug-fix coding assistant. Return corrected code and brief rationale.`;
    case "chat":
    default:
      return `${CORE_SYSTEM_INSTRUCTIONS}\n\nIntent behavior: Detect whether the user requests implementation. If yes, return (1) a short numbered step-by-step plan where EVERY step includes exactly one runnable command, and (2) a JSON block with fileOperations using relative paths and full file contents. Include directory creation commands (for example \`mkdir -p ...\`) before file writes when needed. Do not use placeholders for code unless business data is missing. Never output multi-OS command alternatives in one block (for example do not include open + xdg-open + start together). If no implementation is requested, provide concise technical guidance.`;
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
      return `Answer this programming request with practical and accurate guidance.${context}\n\n${
        looksLikeBuildRequest(payload.userPrompt)
          ? "Implementation intent detected. Produce a step-by-step execution plan where each step has a runnable command (`Command:`), then a JSON block with fileOperations."
          : "If the request needs project file changes, include a step-by-step plan where each step has a runnable command (`Command:`), then a JSON block with fileOperations."
      }\n\nRules:\n- If the user message is a greeting or casual chat with no task, reply naturally and do NOT return JSON.\n- Commands should assume execution from the currently opened project root.\n- Each step must contain exactly one executable command line.\n- Never include OS alternatives in the same command block.\n- If creating files in new folders, include mkdir commands before creation.\n- If requirements are ambiguous, ask a concise clarification question before implementation.\n- If the request is clear enough, choose sensible defaults and proceed.\n- Prefer safe, non-destructive commands.\n\nJSON format:\n\`\`\`json\n{"fileOperations":[{"path":"relative/path.ext","action":"update","content":"..."}]}\n\`\`\`\n\nUser request: ${payload.userPrompt}`;
  }
}
