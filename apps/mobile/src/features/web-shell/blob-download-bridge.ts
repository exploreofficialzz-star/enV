import { MAX_NATIVE_DOWNLOAD_BYTES, WEB_APP_ORIGIN } from "@/lib/web-app-config";

const MAX_BYTES = MAX_NATIVE_DOWNLOAD_BYTES;

export const BLOB_DOWNLOAD_BRIDGE_SCRIPT = `
(function () {
  if (window.__envBlobDownloadBridgeInstalled) return true;
  if (window.location.origin !== ${JSON.stringify(WEB_APP_ORIGIN)}) return true;
  window.__envBlobDownloadBridgeInstalled = true;

  var maxBytes = ${MAX_BYTES};
  var chunkSize = 98304;
  function post(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }
  function encodeChunk(bytes, start, end) {
    var binary = "";
    for (var index = start; index < end; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return window.btoa(binary);
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (target && target.nodeType !== 1) target = target.parentElement;
    var anchor = target && target.closest ? target.closest("a[download]") : null;
    if (!anchor || !anchor.href || anchor.href.indexOf("blob:") !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();

    var id = "env-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10);
    var name = (anchor.getAttribute("download") || "env-download").slice(0, 180);
    var objectUrl = anchor.href;
    fetch(objectUrl)
      .then(function (response) {
        if (!response.ok) throw new Error("The generated file could not be read.");
        return response.blob();
      })
      .then(async function (blob) {
        if (blob.size > maxBytes) {
          window.URL.revokeObjectURL(objectUrl);
          post({ type: "env-download-error", message: "This file is larger than the 100 MB in-app sharing limit." });
          return;
        }
        var bytes = new Uint8Array(await blob.arrayBuffer());
        window.URL.revokeObjectURL(objectUrl);
        post({
          type: "env-download-start",
          id: id,
          name: name,
          mimeType: blob.type || "application/octet-stream",
          size: bytes.byteLength
        });
        for (var offset = 0; offset < bytes.length; offset += chunkSize) {
          var end = Math.min(offset + chunkSize, bytes.length);
          post({ type: "env-download-chunk", id: id, base64: encodeChunk(bytes, offset, end) });
        }
        post({ type: "env-download-complete", id: id });
      })
      .catch(function (error) {
        window.URL.revokeObjectURL(objectUrl);
        var message = error && error.message ? String(error.message) : "The file could not be prepared for sharing.";
        post({ type: "env-download-error", message: message.slice(0, 180) });
      });
  }, true);

  return true;
})();
true;
`;
