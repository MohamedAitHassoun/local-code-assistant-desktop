import { create } from "zustand";
import { basename } from "@/lib/utils";
import type {
  EditorTab,
  SelectionRange,
  SuggestedCommand,
  SuggestedEdit,
  SuggestedFilePlan
} from "@/types";

interface EditorStoreState {
  tabs: EditorTab[];
  activePath: string | null;
  selection: SelectionRange | null;
  pendingEdit: SuggestedEdit | null;
  pendingCommand: SuggestedCommand | null;
  pendingFilePlan: SuggestedFilePlan | null;
  openTab: (path: string, language: string, content: string) => void;
  closeTab: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string, content: string) => void;
  setActivePath: (path: string | null) => void;
  setSelection: (selection: SelectionRange | null) => void;
  setPendingEdit: (edit: SuggestedEdit | null) => void;
  setPendingCommand: (command: SuggestedCommand | null) => void;
  setPendingFilePlan: (plan: SuggestedFilePlan | null) => void;
  applyPendingEdit: () => void;
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  tabs: [],
  activePath: null,
  selection: null,
  pendingEdit: null,
  pendingCommand: null,
  pendingFilePlan: null,
  openTab: (path, language, content) =>
    set((state) => {
      const existing = state.tabs.find((tab) => tab.path === path);
      if (existing) {
        return { activePath: path };
      }

      return {
        tabs: [
          ...state.tabs,
          {
            path,
            name: basename(path),
            language,
            content,
            savedContent: content,
            dirty: false
          }
        ],
        activePath: path
      };
    }),
  closeTab: (path) =>
    set((state) => {
      const nextTabs = state.tabs.filter((tab) => tab.path !== path);
      const nextActive =
        state.activePath === path ? (nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].path : null) : state.activePath;

      return {
        tabs: nextTabs,
        activePath: nextActive,
        selection: state.activePath === path ? null : state.selection
      };
    }),
  updateContent: (path, content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              content,
              dirty: content !== tab.savedContent
            }
          : tab
      )
    })),
  markSaved: (path, content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              content,
              savedContent: content,
              dirty: false
            }
          : tab
      )
    })),
  setActivePath: (activePath) => set({ activePath }),
  setSelection: (selection) => set({ selection }),
  setPendingEdit: (pendingEdit) => set({ pendingEdit }),
  setPendingCommand: (pendingCommand) => set({ pendingCommand }),
  setPendingFilePlan: (pendingFilePlan) => set({ pendingFilePlan }),
  applyPendingEdit: () => {
    const pending = get().pendingEdit;
    if (!pending) {
      return;
    }

    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === pending.filePath
          ? {
              ...tab,
              content: pending.proposedContent,
              dirty: pending.proposedContent !== tab.savedContent
            }
          : tab
      ),
      pendingEdit: null
    }));
  }
}));
