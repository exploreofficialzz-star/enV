export interface ImageLayer {
  id: string;
  name: string;
  kind: "image" | "text" | "shape" | "mask";
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
}

export interface ImageDocumentSnapshot {
  width: number;
  height: number;
  background: string;
  layers: ImageLayer[];
  transformRevision: number;
}

export interface ImageDocument extends ImageDocumentSnapshot {
  id: string;
  sourceAssetId: string;
  metadataPolicy: "preserve" | "safe" | "remove-all";
}

export function createImageDocument(sourceAssetId: string, width: number, height: number): ImageDocument {
  return { id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `doc-${Date.now()}`, sourceAssetId, width, height, background: "transparent", metadataPolicy: "safe", transformRevision: 0, layers: [{ id: "base", name: "Original", kind: "image", visible: true, locked: true, opacity: 1, blendMode: "source-over" }] };
}
