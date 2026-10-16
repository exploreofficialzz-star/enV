/** Per-process admission control for memory-heavy FFmpeg jobs (not a distributed queue). */
export function createMediaJobAdmission(maxConcurrentJobs = 1) {
  const limit = Math.max(1, Math.min(16, Math.floor(Number(maxConcurrentJobs) || 1)));
  let active = 0;
  return {
    get activeJobs() { return active; },
    get maxConcurrentJobs() { return limit; },
    tryEnter() {
      if (active >= limit) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      };
    },
  };
}
