import { invoke } from "@tauri-apps/api/core";
import type { CommandRunResult } from "@/types";

interface RunProjectCommandArgs {
  command: string;
  projectRoot: string;
  allowedPrefixes: string[];
  timeoutSeconds?: number;
}

export async function runProjectCommand({
  command,
  projectRoot,
  allowedPrefixes,
  timeoutSeconds = 120
}: RunProjectCommandArgs): Promise<CommandRunResult> {
  return invoke("run_project_command", {
    command,
    projectRoot,
    allowedPrefixes,
    timeoutSeconds
  });
}
