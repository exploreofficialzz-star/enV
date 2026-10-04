import * as React from "react";
import { createRoot } from "react-dom/client";
import { ImageEngine } from "@/components/engines/image-engine";
const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(<ImageEngine op={params.get("op") || "levels"} category={params.get("cat") || "image"} toolId={params.get("op") || "levels"} />);
