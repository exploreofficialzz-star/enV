import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, [
  "--experimental-strip-types", "--test", "src/lib/world-lab/model.test.ts", "src/lib/world-lab/project.test.ts", "src/lib/world-lab/frames.test.ts", "src/lib/world-lab/coupling.test.ts", "src/lib/world-lab/time-trace.test.ts", "src/lib/world-lab/run-record.test.ts", "src/lib/world-lab/observer.test.ts", "src/lib/world-lab/physical-motion.test.ts", "src/lib/world-lab/electromechanical.test.ts",
], { stdio: "inherit" });
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
