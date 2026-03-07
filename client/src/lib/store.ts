/**
 * Global state management using zustand-like pattern with React context
 * Manages API connections, settings, and shared state
 */
import { create } from "@/lib/create-store";

// ─── Config Store ───
interface ConfigState {
  domainSlayerUrl: string;
  fridayAiUrl: string;
  aiKeys: {
    openai?: { apiKey: string; model?: string };
    claude?: { apiKey: string; model?: string };
    gemini?: { apiKey: string; model?: string };
    deepseek?: { apiKey: string; model?: string };
  };
  setDomainSlayerUrl: (url: string) => void;
  setFridayAiUrl: (url: string) => void;
  setAiKeys: (keys: ConfigState["aiKeys"]) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  domainSlayerUrl: localStorage.getItem("dc_url") || "",
  fridayAiUrl: localStorage.getItem("friday_url") || "",
  aiKeys: JSON.parse(localStorage.getItem("ai_keys") || "{}"),
  setDomainSlayerUrl: (url: string) => {
    localStorage.setItem("dc_url", url);
    set({ domainSlayerUrl: url });
  },
  setFridayAiUrl: (url: string) => {
    localStorage.setItem("friday_url", url);
    set({ fridayAiUrl: url });
  },
  setAiKeys: (keys) => {
    localStorage.setItem("ai_keys", JSON.stringify(keys));
    set({ aiKeys: keys });
  },
}));
