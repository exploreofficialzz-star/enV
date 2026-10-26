import { autoMask, borderColor } from "@/lib/image/cutout";

/** Local, edge-connected color removal. No upload or subject-detection claim. */
export async function editStudioImage(source: string, operation: "cutout" | "icon" | "resize", strength = 40, maxEdge = 1024) {
  const image = new Image(); image.src = source; await image.decode();
  const limit = operation === "icon" ? 128 : maxEdge;
  const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio)), height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image editing is unavailable in this browser.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  if (operation !== "resize") {
    const mask = autoMask(pixels.data, width, height, [borderColor(pixels.data, width, height)], strength, 16, "edge");
    for (let i = 0; i < mask.length; i++) pixels.data[i * 4 + 3] = Math.round(pixels.data[i * 4 + 3] * mask[i] / 255);
    context.putImageData(pixels, 0, 0);
  }
  if (operation === "icon") {
    // A real vector silhouette: contiguous foreground pixels become SVG paths.
    let path = "";
    for (let y = 0; y < height; y++) for (let x = 0; x < width;) {
      if (pixels.data[(y * width + x) * 4 + 3] < 96) { x++; continue; }
      const start = x;
      while (x < width && pixels.data[(y * width + x) * 4 + 3] >= 96) x++;
      path += `M${start} ${y}h${x - start}v1H${start}z`;
    }
    if (!path) throw new Error("No foreground found. Lower the cutout strength and try again.");
    return { data: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="currentColor" d="${path}"/></svg>`, width, height };
  }
  return { data: canvas.toDataURL("image/png"), width, height };
}
