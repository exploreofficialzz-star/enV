import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

type GameStudioModule = typeof import("@/components/game-studio/game-studio");
let gameStudioPromise: Promise<GameStudioModule> | null = null;
function loadGameStudio(): Promise<GameStudioModule> {
  gameStudioPromise ??= import("@/components/game-studio/game-studio");
  return gameStudioPromise;
}
const GameStudio = lazy(loadGameStudio);

export const Route = createFileRoute("/3d-game-studio")({
  loader: async () => {
    await loadGameStudio().catch(() => undefined);
    return null;
  },
  component: GameStudioPage,
});

function GameStudioPage() {
  return <AppShell><Suspense fallback={null}><GameStudio /></Suspense></AppShell>;
}
