export const ADSTERRA_PLACEMENT_LOADED_EVENT = "env:adsterra-placement-loaded";
export const ADSTERRA_ACCESS_LOAD_TIMEOUT_MS = 15_000;

/**
 * Resolve only when an Adsterra placement script reports a successful load.
 * A load event is not a verified impression or a rewarded-video completion.
 */
export function waitForAdsterraPlacement(
  target: EventTarget,
  timeoutMs = ADSTERRA_ACCESS_LOAD_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      target.removeEventListener(ADSTERRA_PLACEMENT_LOADED_EVENT, onLoaded);
      resolve(loaded);
    };

    const onLoaded = () => finish(true);
    timeout = setTimeout(() => finish(false), Math.max(0, timeoutMs));
    target.addEventListener(ADSTERRA_PLACEMENT_LOADED_EVENT, onLoaded, { once: true });
  });
}
