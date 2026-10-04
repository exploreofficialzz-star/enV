import type { Scene, SceneItem, SceneLayout } from "@/lib/screenshots/scene";
import type { ScreenshotToolConfig } from "@/lib/screenshots/tool-config";
import type { SourceEntry } from "./use-sources";

export interface PanelCtx {
  cfg: ScreenshotToolConfig; scene: Scene; layout: SceneLayout; adv: boolean;
  edit: (fn: (s: Scene) => Scene, key?: string) => void;
  item: SceneItem | undefined;                       // primary / selected item
  patchItem: (id: string, patch: Partial<SceneItem>, key?: string) => void;
  source: SourceEntry | undefined;                   // source of `item`
}
