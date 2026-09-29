export interface BatchItem<T> {
  id: string;
  fileName: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  result?: T;
  error?: string;
}

export async function runBatch<T>(items: File[], worker: (file: File, signal: AbortSignal, onProgress: (value: number) => void) => Promise<T>, signal?: AbortSignal, onUpdate?: (items: BatchItem<T>[]) => void) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const state: BatchItem<T>[] = items.map((file, index) => ({ id: `${index}-${file.name}`, fileName: file.name, status: "queued", progress: 0 }));
  const emit = () => onUpdate?.(state.map((item) => ({ ...item })));
  emit();
  try {
    for (let i = 0; i < items.length; i++) {
      if (controller.signal.aborted) { state[i].status = "cancelled"; emit(); break; }
      state[i].status = "running"; emit();
      try {
        state[i].result = await worker(items[i], controller.signal, (progress) => { state[i].progress = Math.max(0, Math.min(100, progress)); emit(); });
        state[i].progress = 100; state[i].status = "completed";
      } catch (error) {
        state[i].status = controller.signal.aborted ? "cancelled" : "failed";
        state[i].error = error instanceof Error ? error.message : "Image processing failed.";
      }
      emit();
    }
    return state;
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
  }
}
