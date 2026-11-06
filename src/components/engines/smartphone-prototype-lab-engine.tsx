import { useEffect, useRef, useState } from "react";

/**
 * Hosts the Babylon.js production scene as an isolated same-origin page.
 * Keeping the scene in public/ prevents the 3D bundle from bloating the main app chunk.
 */
export function SmartphonePrototypeLabEngine() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(1080);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let resizeObserver: ResizeObserver | undefined;
    const measure = () => {
      const document = frame.contentDocument;
      if (!document) return;
      const contentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      );
      if (contentHeight > 0) setFrameHeight(Math.min(2600, Math.max(860, contentHeight + 8)));
    };
    const handleLoad = () => {
      measure();
      const document = frame.contentDocument;
      if (document && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(document.documentElement);
        if (document.body) resizeObserver.observe(document.body);
      }
    };

    frame.addEventListener("load", handleLoad);
    window.addEventListener("resize", measure);
    return () => {
      frame.removeEventListener("load", handleLoad);
      window.removeEventListener("resize", measure);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <section className="w-full min-w-0">
      <iframe
        ref={frameRef}
        title="Smartphone Prototype Lab interactive 3D production simulator"
        src="/labs/smartphone-prototype-lab/index.html?embedded=1"
        loading="eager"
        allow="fullscreen"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-downloads"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{
          display: "block",
          width: "100%",
          height: frameHeight,
          border: 0,
          borderRadius: 12,
          background: "#0a0b0e",
        }}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Interactive 3D engineering study. Component geometry and manufacturing order are representative; exact layouts vary by device.
      </p>
    </section>
  );
}
