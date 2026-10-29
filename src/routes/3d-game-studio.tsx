import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

const GameStudio = lazy(() => import("@/components/game-studio/game-studio"));
export const Route = createFileRoute("/3d-game-studio")({ component: GameStudioPage });
function GameStudioPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="mx-auto max-w-5xl px-4 py-10">Loading 3D Game Studio…</p>}>
        <GameStudio />
      </Suspense>
    </AppShell>
  );
}
