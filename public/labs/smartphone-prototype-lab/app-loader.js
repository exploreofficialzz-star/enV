/* Loads the procedural Babylon.js scene from a compressed first-party bundle. */
(async () => {
  const showError = (message) => {
    const loading = document.getElementById("loading");
    if (!loading) return;
    loading.classList.remove("hidden");
    const label = loading.querySelector("span");
    if (label) label.textContent = message;
    const spinner = loading.querySelector(".spinner");
    if (spinner) spinner.hidden = true;
  };
  try {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser does not support compressed model loading. Update your browser and try again.");
    const names = Array.from({ length: 10 }, (_, index) => `app-bundle.${String(index + 1).padStart(2, "0")}.txt`);
    const chunks = await Promise.all(names.map(async (name) => {
      const response = await fetch(new URL(name, document.baseURI), { cache: "force-cache" });
      if (!response.ok) throw new Error("The 3D scene bundle could not be loaded. Check your connection and refresh.");
      return response.text();
    }));
    const encoded = chunks.join("");
    if (encoded.length !== 24600) throw new Error("The 3D scene bundle is incomplete. Refresh to try again.");
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const source = await new Response(decompressed).blob();
    const sourceUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const script = document.createElement("script");
    script.src = sourceUrl;
    script.onload = () => URL.revokeObjectURL(sourceUrl);
    script.onerror = () => { URL.revokeObjectURL(sourceUrl); showError("The 3D scene could not start. Refresh to try again."); };
    document.body.appendChild(script);
  } catch (error) {
    showError(error instanceof Error ? error.message : "The 3D scene could not start. Refresh to try again.");
  }
})();
