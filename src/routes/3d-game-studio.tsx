import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

const GameStudio = lazy(() => import("@/components/game-studio/game-studio"));
export const Route = createFileRoute("/3d-game-studio")({ component: GameStudioPage });
function GameStudioPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <GameStudio />
      </Suspense>
    </AppShell>
  );
}
