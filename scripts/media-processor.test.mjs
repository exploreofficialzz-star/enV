import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";

const PORT = 8791;
const server = spawn(process.execPath, ["scripts/media-processor.mjs"], { env: { ...process.env, MEDIA_PORT: String(PORT) }, cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("media processor did not start")), 5000);
  server.stdout.on("data", (chunk) => { if (chunk.toString().includes("listening")) { clearTimeout(timer); resolve(); } });
  server.once("error", reject);
});

try {
  await test("FFmpeg media processor health endpoint", async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.operations.includes("video-to-mp3"));
    assert.ok(body.operations.includes("video-merge"));
    assert.ok(body.operations.includes("audio-merge"));
    assert.ok(body.operations.includes("video-replace-audio"));
  });

  await test("FFmpeg media processor converts real video and audio formats", async () => {
    await new Promise((resolve, reject) => execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.5", "-c:v", "libx264", "-c:a", "aac", "/tmp/env-media-test-input.mp4", "-y"], (error) => error ? reject(error) : resolve()));
    const input = await fs.readFile("/tmp/env-media-test-input.mp4");
    const request = async (operation, outputName, mime, fileName = "fixture.mp4") => {
      const form = new FormData();
      form.append("file", new Blob([input], { type: fileName.endsWith(".mp3") ? "audio/mpeg" : "video/mp4" }), fileName);
      form.append("operation", operation); form.append("outputName", outputName); form.append("params", "{}");
      const response = await fetch(`http://127.0.0.1:${PORT}/media`, { method: "POST", body: form });
      const output = Buffer.from(await response.arrayBuffer());
      assert.equal(response.status, 200, `${operation} should succeed`);
      assert.equal(response.headers.get("content-type"), mime);
      assert.ok(output.length > 100, `${operation} should produce output`);
      return output;
    };
    const mp4 = await request("video-to-mp4", "fixture.mp4", "video/mp4");
    assert.ok(mp4.subarray(4, 8).toString() === "ftyp" || mp4.includes(Buffer.from("ftyp")));
    const mp3 = await request("video-to-mp3", "fixture.mp3", "audio/mpeg");
    assert.equal(mp3.subarray(0, 3).toString(), "ID3");
    await request("video-to-gif", "fixture.gif", "image/gif");
    await request("video-to-webm", "fixture.webm", "video/webm");
    await request("video-to-mov", "fixture.mov", "video/quicktime");
    await request("video-to-avi", "fixture.avi", "video/x-msvideo");
    const resizeForm = new FormData(); resizeForm.append("file", new Blob([input], { type: "video/mp4" }), "fixture.mp4"); resizeForm.append("operation", "video-resize"); resizeForm.append("outputName", "resize.mp4"); resizeForm.append("params", JSON.stringify({width:120,height:90}));
    const resizeResponse = await fetch(`http://127.0.0.1:${PORT}/media`, {method:"POST",body:resizeForm}); assert.equal(resizeResponse.status,200); assert.equal(resizeResponse.headers.get("content-type"),"video/mp4"); assert.ok((await resizeResponse.arrayBuffer()).byteLength>100);
    for (const [operation, params] of [["video-crop",{width:100,height:80,x:0,y:0}],["video-rotate",{angle:"90"}],["video-mute",{}],["video-fps",{fps:12}],["video-bitrate",{bitrate:500}]]) { const form=new FormData(); form.append("file",new Blob([input],{type:"video/mp4"}),"fixture.mp4"); form.append("operation",operation); form.append("outputName",`${operation}.mp4`); form.append("params",JSON.stringify(params)); const response=await fetch(`http://127.0.0.1:${PORT}/media`,{method:"POST",body:form}); assert.equal(response.status,200,operation); assert.equal(response.headers.get("content-type"),"video/mp4"); assert.ok((await response.arrayBuffer()).byteLength>100); }
    await request("video-compress", "fixture-compressed.mp4", "video/mp4");
    await request("video-trim", "fixture-trim.mp4", "video/mp4");
    const mp3Form = new FormData();
    mp3Form.append("file", new Blob([mp3], { type: "audio/mpeg" }), "fixture.mp3");
    mp3Form.append("operation", "audio-to-wav"); mp3Form.append("outputName", "fixture.wav"); mp3Form.append("params", "{}");
    const wavResponse = await fetch(`http://127.0.0.1:${PORT}/media`, { method: "POST", body: mp3Form });
    const wav = Buffer.from(await wavResponse.arrayBuffer());
    assert.equal(wavResponse.status, 200); assert.equal(wavResponse.headers.get("content-type"), "audio/wav"); assert.equal(wav.subarray(0,4).toString(), "RIFF");
    for (const [operation, name, mime] of [["audio-to-mp3","fixture2.mp3","audio/mpeg"],["audio-to-ogg","fixture.ogg","audio/ogg"],["audio-to-flac","fixture.flac","audio/flac"]]) {
      const form = new FormData(); form.append("file", new Blob([wav], { type: "audio/wav" }), "fixture.wav"); form.append("operation", operation); form.append("outputName", name); form.append("params", "{}");
      const response = await fetch(`http://127.0.0.1:${PORT}/media`, { method: "POST", body: form }); const output = Buffer.from(await response.arrayBuffer());
      assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), mime); assert.ok(output.length > 100);
    }
    const multiRequest = async (operation, outputName, mime, entries) => {
      const form = new FormData();
      entries.forEach(({ data, type, name }) => form.append("files", new Blob([data], { type }), name));
      form.append("operation", operation); form.append("outputName", outputName); form.append("params", "{}");
      const response = await fetch(`http://127.0.0.1:${PORT}/media`, { method: "POST", body: form });
      const output = Buffer.from(await response.arrayBuffer());
      assert.equal(response.status, 200, `${operation} should succeed`);
      assert.equal(response.headers.get("content-type"), mime);
      assert.ok(output.length > 100, `${operation} should produce output`);
      return output;
    };
    await multiRequest("audio-merge", "merged.wav", "audio/wav", [
      { data: wav, type: "audio/wav", name: "one.wav" },
      { data: wav, type: "audio/wav", name: "two.wav" },
    ]);
    await multiRequest("video-merge", "merged.mp4", "video/mp4", [
      { data: input, type: "video/mp4", name: "one.mp4" },
      { data: input, type: "video/mp4", name: "two.mp4" },
    ]);
    await multiRequest("video-replace-audio", "replaced.mp4", "video/mp4", [
      { data: input, type: "video/mp4", name: "video.mp4" },
      { data: wav, type: "audio/wav", name: "audio.wav" },
    ]);
  });
} finally {
  server.kill("SIGTERM");
  await once(server, "exit").catch(() => undefined);
  await fs.rm("/tmp/env-media-test-input.mp4", { force: true });
}
