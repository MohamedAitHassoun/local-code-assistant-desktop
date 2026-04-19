import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { FileNode, RecentProject } from "@/types";

interface ProjectExplorerProps {
  tree: FileNode | null;
  rootPath: string | null;
  selectedContextFiles: string[];
  recentProjects: RecentProject[];
  skippedEntries: number;
  onOpenFile: (path: string) => void;
  onToggleContextFile: (path: string) => void;
  onOpenRecentProject: (path: string) => void;
}

function TreeNode({
  node,
  depth,
  expanded,
  toggleExpanded,
  selectedContextFiles,
  onOpenFile,
  onToggleContextFile
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  selectedContextFiles: string[];
  onOpenFile: (path: string) => void;
  onToggleContextFile: (path: string) => void;
}) {
  const isDir = node.isDir;
  const isOpen = expanded.has(node.path);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-slate-100",
          isDir ? "text-ink" : "text-ink/90"
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {isDir ? (
          <button
            type="button"
            onClick={() => toggleExpanded(node.path)}
            className="h-5 w-5 rounded text-xs text-ink/70 hover:bg-slate-200"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="h-5 w-5 text-center text-xs text-ink/40">•</span>
        )}

        {!isDir && (
          <input
            type="checkbox"
            checked={selectedContextFiles.includes(node.path)}
            onChange={() => onToggleContextFile(node.path)}
            title="Include this file in AI context"
            className="h-3.5 w-3.5 rounded border-border"
          />
        )}

        <button
          type="button"
          onClick={() => {
            if (isDir) {
              toggleExpanded(node.path);
            } else {
              onOpenFile(node.path);
            }
          }}
          className="truncate text-left"
          title={node.path}
        >
          {node.name}
        </button>
      </div>

      {isDir && isOpen && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          selectedContextFiles={selectedContextFiles}
          onOpenFile={onOpenFile}
          onToggleContextFile={onToggleContextFile}
        />
      ))}
    </div>
  );
}

export function ProjectExplorer({
  tree,
  rootPath,
  selectedContextFiles,
  recentProjects,
  skippedEntries,
  onOpenFile,
  onToggleContextFile,
  onOpenRecentProject
}: ProjectExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const hasTree = Boolean(tree && rootPath);

  useEffect(() => {
    if (tree?.path) {
      setExpanded(new Set([tree.path]));
    }
  }, [tree?.path]);

  const toggleExpanded = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <aside className="flex h-full flex-col border-r border-border bg-panel/95">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/70">Explorer</h2>
        <p className="mt-1 truncate text-xs text-ink/60" title={rootPath ?? "No project"}>
          {rootPath ?? "Open a file or project to begin"}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {hasTree && tree ? (
          <>
            <TreeNode
              node={tree}
              depth={0}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selectedContextFiles={selectedContextFiles}
              onOpenFile={onOpenFile}
              onToggleContextFile={onToggleContextFile}
            />
            <p className="mt-3 px-2 text-xs text-ink/50">Skipped entries: {skippedEntries}</p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-slate-50 p-3 text-sm text-ink/70">
            Project files will appear here.
          </div>
        )}
      </div>

      <div className="border-t border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/60">Recent Projects</h3>
        <div className="mt-2 flex max-h-28 flex-col gap-1 overflow-auto">
          {recentProjects.length === 0 ? (
            <span className="text-xs text-ink/40">No recent projects yet.</span>
          ) : (
            recentProjects.map((project) => (
              <button
                key={project.path}
                type="button"
                onClick={() => onOpenRecentProject(project.path)}
                className="truncate rounded bg-slate-100 px-2 py-1 text-left text-xs text-ink/80 hover:bg-slate-200"
                title={project.path}
              >
                {project.path}
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
