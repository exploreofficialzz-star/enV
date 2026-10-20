import { useSyncExternalStore } from "react";

export type InstallChoice = "accepted" | "dismissed" | "unavailable";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

export type PwaInstallState = {
  canInstall: boolean;
  installed: boolean;
};

const SERVER_STATE: PwaInstallState = { canInstall: false, installed: false };
let state: PwaInstallState = SERVER_STATE;
let deferredPrompt: InstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function isRunningInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

function publish(next: PwaInstallState): void {
  if (state.canInstall === next.canInstall && state.installed === next.installed) return;
  state = next;
  subscribers.forEach((subscriber) => subscriber());
}

export function getPwaInstallState(): PwaInstallState {
  return state;
}

export function getPwaInstallServerSnapshot(): PwaInstallState {
  return SERVER_STATE;
}

export function subscribePwaInstallState(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => { subscribers.delete(subscriber); };
}

/** Keep the browser-provided installation event alive while routes change. */
export function startPwaInstallCapture(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onBeforeInstallPrompt = (event: Event) => {
    const promptEvent = event as InstallPromptEvent;
    if (typeof promptEvent.prompt !== "function" || !promptEvent.userChoice) return;
    event.preventDefault();
    deferredPrompt = promptEvent;
    publish({ canInstall: true, installed: isRunningInstalled() });
  };

  const onAppInstalled = () => {
    deferredPrompt = null;
    publish({ canInstall: false, installed: true });
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
  publish({ canInstall: Boolean(deferredPrompt), installed: isRunningInstalled() });

  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onAppInstalled);
  };
}

export async function promptEnVInstallation(): Promise<InstallChoice> {
  if (!deferredPrompt) return "unavailable";
  const promptEvent = deferredPrompt;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    deferredPrompt = null;
    publish({ canInstall: false, installed: choice.outcome === "accepted" || isRunningInstalled() });
    return choice.outcome;
  } catch {
    deferredPrompt = null;
    publish({ canInstall: false, installed: isRunningInstalled() });
    return "unavailable";
  }
}
