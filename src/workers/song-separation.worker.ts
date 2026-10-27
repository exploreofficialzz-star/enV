import { createSpleeterSpectrum, SPLEETER_FRAMES, SPLEETER_MODEL_BINS, synthesizeSpleeterStem } from "../lib/media/spleeter-audio";

const MODEL_BASE = "https://huggingface.co/Best-Practice/spleeter-4stems-onnx/resolve/486643021f18a4d057d282fff1d11b89a30e9887/";
const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const MODEL_NAMES = ["drums", "bass", "other", "vocals"] as const;
type Session = { run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array; dims: readonly number[] }>> };
type Ort = { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown; InferenceSession: { create: (bytes: Uint8Array, options: Record<string, unknown>) => Promise<Session> }; env: { wasm: { wasmPaths: string; numThreads: number; proxy: boolean } } };
let ort: Ort | undefined;
let sessions: Session[] | undefined;

self.onmessage = async (event: MessageEvent<{ id: string; channels: [Float32Array, Float32Array] }>) => {
  const { id, channels } = event.data;
  const progress = (fraction: number, stage: string) => self.postMessage({ id, type: "progress", fraction, stage });
  try {
    if (!ort) {
      progress(1, "Loading the separation runtime");
      ort = await import(/* @vite-ignore */ `${ORT_BASE}ort.wasm.min.mjs`) as Ort;
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
    }
    if (!sessions) {
      const loaded: Session[] = [];
      for (let i = 0; i < MODEL_NAMES.length; i++) {
        const name = MODEL_NAMES[i];
        progress(2 + i * 7, `Loading ${name} separation model`);
        const response = await fetch(`${MODEL_BASE}${name}.fp16.onnx`, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Could not download the ${name} model (HTTP ${response.status}).`);
        loaded.push(await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()), { executionProviders: ["wasm"], graphOptimizationLevel: "all" }));
      }
      sessions = loaded;
    }
    progress(32, "Preparing audio frequencies");
    const spectrum = createSpleeterSpectrum(channels);
    if (spectrum.splits !== 1) throw new Error("A separation window exceeded the model's memory budget.");
    const estimates: Float32Array[] = [];
    for (let i = 0; i < sessions.length; i++) {
      progress(35 + i * 10, `Separating ${MODEL_NAMES[i]}`);
      const output = await sessions[i].run({ x: new ort.Tensor("float32", spectrum.magnitude, [2, spectrum.splits, SPLEETER_FRAMES, SPLEETER_MODEL_BINS]) });
      const estimate = output.y;
      if (!estimate || estimate.data.length !== spectrum.magnitude.length || estimate.dims.join(",") !== `2,${spectrum.splits},${SPLEETER_FRAMES},${SPLEETER_MODEL_BINS}`) throw new Error("The separation model returned an unsupported output.");
      estimates.push(new Float32Array(estimate.data));
    }
    const stems: Float32Array[][] = [];
    for (let i = 0; i < MODEL_NAMES.length; i++) {
      progress(76 + i * 5, `Reconstructing ${MODEL_NAMES[i]}`);
      stems.push(synthesizeSpleeterStem(spectrum, estimates, i));
    }
    self.postMessage({ id, type: "result", stems }, { transfer: stems.flat().map((channel) => channel.buffer) });
  } catch (error) {
    self.postMessage({ id, type: "error", error: error instanceof Error ? error.message : "Sound separation could not run on this device." });
  }
};
