import { create } from "zustand";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { AppSettings } from "@/types";

interface SettingsStoreState {
  settings: AppSettings;
  loaded: boolean;
  setLoaded: (loaded: boolean) => void;
  updateSettings: (changes: Partial<AppSettings>) => void;
  replaceSettings: (settings: AppSettings) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  setLoaded: (loaded) => set({ loaded }),
  updateSettings: (changes) =>
    set((state) => ({
      settings: {
        ...state.settings,
        ...changes
      }
    })),
  replaceSettings: (settings) => set({ settings })
}));
