import { defineHandler } from "nitro/h3";
import { backendConfig, joinUrl } from "../../../../backend/config";
import { jsonResponse, optionsResponse, proxyRequest, measureServerOperation } from "../../../../backend/http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function run(bin: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`${bin} failed (${code}). ${stderr.slice(-1000)}`)));
  });
}

export default defineHandler(async (event) => {
  if (event.req.method === "OPTIONS") return optionsResponse();
  const configuredOcr = backendConfig().ocr;
  if (configuredOcr) {
    return proxyRequest(event.req, joinUrl(configuredOcr, "ocr"), "cloud.document_processing");
  }

  // Tesseract fallback runs in the gateway process. Meter only operational dimensions and never
  // include image/PDF contents, file names, extracted text, or OCR results in billing telemetry.
  return measureServerOperation(event.req, "server.ocr_processing", async () => {
    const directory = await mkdtemp(join(tmpdir(), `env-ocr-${randomUUID()}-`));
    try {
      const form = await event.req.formData();
      const files = form.getAll("files").filter((item): item is File => item instanceof File);
      if (!files.length) return jsonResponse({ error: "Choose an image or PDF first." }, 400);
      const language = String(form.get("language") ?? "eng").replace(/[^a-zA-Z+_-]/g, "") || "eng";
      const results: string[] = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "input";
        const input = join(directory, safeName);
        await writeFile(input, Buffer.from(await file.arrayBuffer()));
        const base = join(directory, `ocr-${results.length}`);
        await run(process.env.TESSERACT_BIN || "tesseract", [input, base, "-l", language]);
        results.push(await readFile(`${base}.txt`, "utf8"));
      }
      return jsonResponse({ text: results.join("\n\n"), language });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "OCR failed." }, 400);
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  });
});
