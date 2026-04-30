import { create } from "zustand";
import type { FileNode, ProjectScanResult, ScannedFile } from "@/types";

interface ProjectStoreState {
  rootPath: string | null;
  tree: FileNode | null;
  files: ScannedFile[];
  skippedEntries: number;
  selectedContextFiles: string[];
  projectSummary: string;
  isScanning: boolean;
  setProject: (scanResult: ProjectScanResult) => void;
  setRootPath: (path: string | null) => void;
  setIsScanning: (isScanning: boolean) => void;
  toggleContextFile: (path: string) => void;
  addContextFiles: (paths: string[]) => void;
  clearContextFiles: () => void;
  clearProject: () => void;
  setProjectSummary: (summary: string) => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  rootPath: null,
  tree: null,
  files: [],
  skippedEntries: 0,
  selectedContextFiles: [],
  projectSummary: "",
  isScanning: false,
  setProject: (scanResult) =>
    set(() => ({
      rootPath: scanResult.rootPath,
      tree: scanResult.tree,
      files: scanResult.files,
      skippedEntries: scanResult.skippedEntries,
      selectedContextFiles: [],
      projectSummary: ""
    })),
  setRootPath: (rootPath) => set({ rootPath }),
  setIsScanning: (isScanning) => set({ isScanning }),
  toggleContextFile: (path) =>
    set((state) => {
      const alreadySelected = state.selectedContextFiles.includes(path);
      return {
        selectedContextFiles: alreadySelected
          ? state.selectedContextFiles.filter((item) => item !== path)
          : [...state.selectedContextFiles, path]
      };
    }),
  addContextFiles: (paths) =>
    set((state) => {
      const merged = new Set(state.selectedContextFiles);
      for (const path of paths) {
        const trimmed = path.trim();
        if (!trimmed) continue;
        merged.add(trimmed);
      }

      return {
        selectedContextFiles: Array.from(merged)
      };
    }),
  clearContextFiles: () =>
    set({
      selectedContextFiles: []
    }),
  clearProject: () =>
    set({
      rootPath: null,
      tree: null,
      files: [],
      skippedEntries: 0,
      selectedContextFiles: [],
      projectSummary: ""
    }),
  setProjectSummary: (projectSummary) => set({ projectSummary })
}));
