import { removeStudioImageBackground, type StudioImageOptions } from "@/lib/engines/studio-image-mask";

export type { StudioImageOptions } from "@/lib/engines/studio-image-mask";

/** Local color removal with real PNG transparency. Reprocess the original source when settings change. */
export async function editStudioImage(source: string, operation: "cutout" | "chroma" | "icon" | "resize", strength: number | StudioImageOptions = 40, maxEdge = 1024) {
  const image = new Image(); image.src = source; await image.decode();
  const limit = operation === "icon" ? 128 : Math.max(1, Math.min(4096, Math.round(maxEdge) || 1024));
  const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio)), height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image editing is unavailable in this browser.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const options = typeof strength === "number" ? { tolerance: strength } : strength;
  let removal: ReturnType<typeof removeStudioImageBackground> | undefined;
  // An already transparent icon must keep its existing foreground: do not guess its subject color as a new key.
  const hasTransparency = pixels.data.some((alpha, index) => index % 4 === 3 && alpha < 8);
  if (operation !== "resize" && !(operation === "icon" && hasTransparency)) {
    removal = removeStudioImageBackground(pixels.data, width, height, options, operation === "chroma");
    if (!removal.remainingPixels) throw new Error("These settings would remove the entire image. Lower the tolerance or choose a different background color.");
    if (!removal.removedPixels) throw new Error(removal.warning || "No matching background was found. Pick its color, increase tolerance, or choose All matching colors.");
    pixels.data.set(removal.pixels);
    context.putImageData(pixels, 0, 0);
  }
  const details = { removedPixels: removal?.removedPixels ?? 0, remainingPixels: removal?.remainingPixels ?? pixels.data.filter((alpha, index) => index % 4 === 3 && alpha > 8).length, removedFraction: removal?.removedFraction ?? 0, sampledColors: removal?.sampledColors ?? [], warning: removal?.warning };
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
    return { data: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="currentColor" d="${path}"/></svg>`, width, height, ...details };
  }
  return { data: canvas.toDataURL("image/png"), width, height, ...details };
}
