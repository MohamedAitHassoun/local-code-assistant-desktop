import type { SelectionRange } from "@/types";

export function replaceSelectionInText(
  source: string,
  selection: SelectionRange,
  replacement: string
): string {
  const lines = source.split("\n");

  const startLineIndex = Math.max(selection.startLineNumber - 1, 0);
  const endLineIndex = Math.max(selection.endLineNumber - 1, 0);

  if (startLineIndex >= lines.length || endLineIndex >= lines.length || startLineIndex > endLineIndex) {
    return source;
  }

  const prefix = lines[startLineIndex].slice(0, Math.max(selection.startColumn - 1, 0));
  const suffix = lines[endLineIndex].slice(Math.max(selection.endColumn - 1, 0));

  const replacementLines = replacement.split("\n");
  const mergedFirst = `${prefix}${replacementLines[0] ?? ""}`;
  const mergedLast = `${replacementLines[replacementLines.length - 1] ?? ""}${suffix}`;

  const body: string[] = [];
  if (replacementLines.length === 1) {
    body.push(`${prefix}${replacementLines[0] ?? ""}${suffix}`);
  } else {
    body.push(mergedFirst);
    body.push(...replacementLines.slice(1, -1));
    body.push(mergedLast);
  }

  const before = lines.slice(0, startLineIndex);
  const after = lines.slice(endLineIndex + 1);

  return [...before, ...body, ...after].join("\n");
}
