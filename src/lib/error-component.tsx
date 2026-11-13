import { useEffect, useId } from "react";
import { useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "We couldn’t complete this page request. Try again or return to enV.";

function statusCodeOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
    data?: { status?: unknown };
  };
  const status = [value.status, value.statusCode, value.response?.status, value.data?.status]
    .find(candidate => typeof candidate === "number");
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

function publicErrorMessage(error: unknown): string {
  if (import.meta.env.DEV) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error) return error;
  }

  const status = statusCodeOf(error);
  if (status === 401) return "Your session may have expired. Sign in again and retry the action.";
  if (status === 403) return "You do not have permission to open this page.";
  if (status === 404) return "This page or resource could not be found.";
  if (status === 429) return "enV is handling too many requests right now. Wait a moment and retry.";
  if (status !== null && status >= 500) return "An enV service is temporarily unavailable. Retry shortly.";
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: { error: unknown }) {
  const router = useRouter();
  const reactId = useId();
  const reference = reactId.replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase() || "PAGE";
  const status = statusCodeOf(error);

  useEffect(() => {
    console.error("[enV page error]", {
      reference,
      status: status ?? undefined,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }, [error, reference, status]);

  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400" role="alert">
        {publicErrorMessage(error)}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Reference: ENV-PAGE-{reference}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => { void router.invalidate(); }}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          Return to enV
        </a>
      </div>
    </main>
  );
}
