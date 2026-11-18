#!/usr/bin/env node
/**
 * Run npm's production dependency audit with a narrow, evidence-backed exception
 * for the currently unpatched picomatch ReDoS advisory.
 *
 * This does not disable npm audit. Every moderate/high/critical finding must
 * either resolve exclusively to the exact approved advisory below or the check
 * fails. The exception also requires the locked picomatch version, affected
 * range, and there being no viable Picomatch fix. npm may suggest downgrading a
 * parent package across a major version; that is not treated as a safe remediation.
 *
 * Remove this exception and upgrade picomatch as soon as an upstream fix ships.
 */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ADVISORY_URL = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const PICOMATCH_VERSION = "4.0.7";
const PICOMATCH_RANGE = "<=4.0.7";
const SEVERITIES_REQUIRING_ACTION = new Set(["moderate", "high", "critical"]);

function fail(message) {
  console.error("[dependency-audit] " + message);
  process.exitCode = 1;
}

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const audit = spawnSync(command, ["audit", "--json", "--audit-level=moderate"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

if (audit.error) {
  fail("npm audit could not run: " + audit.error.message);
} else {
  let report;
  try {
    report = JSON.parse(audit.stdout || "");
  } catch {
    fail("npm audit did not return valid JSON. " + (audit.stderr || audit.stdout || "No output received."));
  }

  if (report) {
    const vulnerabilities = report.vulnerabilities ?? {};
    const blocking = Object.entries(vulnerabilities)
      .filter(([, vulnerability]) => SEVERITIES_REQUIRING_ACTION.has(vulnerability.severity));

    if (blocking.length === 0) {
      if (audit.status !== 0) {
        fail("npm audit exited with status " + audit.status + " despite reporting no moderate-or-higher vulnerabilities. " + (audit.stderr || ""));
      } else {
        console.log("[dependency-audit] No moderate, high, or critical dependency vulnerabilities found.");
      }
    } else {
      let lock;
      let packageManifest;
      try {
        [lock, packageManifest] = await Promise.all([
          readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
          readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
        ]);
      } catch (error) {
        fail("Could not read package.json or package-lock.json: " + error.message);
      }

      function hasNoViablePicomatchFix(fixAvailable) {
        if (fixAvailable === false) return true;
        if (!fixAvailable || typeof fixAvailable !== "object" ||
            fixAvailable.name !== "vite" || fixAvailable.isSemVerMajor !== true ||
            typeof fixAvailable.version !== "string") return false;

        const lockedViteVersion = lock?.packages?.["node_modules/vite"]?.version;
        const declaredViteRange = packageManifest?.dependencies?.vite;
        const lockedMajor = typeof lockedViteVersion === "string"
          ? Number(lockedViteVersion.match(/^(\\d+)\\./)?.[1])
          : NaN;
        const declaredMajor = typeof declaredViteRange === "string"
          ? Number(declaredViteRange.match(/^\\^(\\d+)\\./)?.[1])
          : NaN;
        const suggestedMajor = Number(fixAvailable.version.match(/^(\\d+)\\./)?.[1]);

        return Number.isInteger(lockedMajor) &&
          Number.isInteger(declaredMajor) &&
          Number.isInteger(suggestedMajor) &&
          lockedMajor === declaredMajor &&
          suggestedMajor < lockedMajor;
      }

      const picomatch = vulnerabilities.picomatch;
      const picomatchNodes = picomatch?.nodes ?? [];
      const lockedVersionsMatch = Boolean(
        lock &&
        picomatchNodes.length > 0 &&
        picomatchNodes.every((node) => lock.packages?.[node]?.version === PICOMATCH_VERSION)
      );
      const approvedPicomatchAdvisory = Boolean(
        picomatch &&
        picomatch.severity === "high" &&
        picomatch.range === PICOMATCH_RANGE &&
        hasNoViablePicomatchFix(picomatch.fixAvailable) &&
        lockedVersionsMatch &&
        Array.isArray(picomatch.via) &&
        picomatch.via.length === 1 &&
        picomatch.via[0] &&
        typeof picomatch.via[0] === "object" &&
        picomatch.via[0].url === ADVISORY_URL &&
        picomatch.via[0].name === "picomatch" &&
        picomatch.via[0].severity === "high" &&
        picomatch.via[0].range === PICOMATCH_RANGE
      );

      function tracesOnlyToApprovedPicomatch(name, trail = new Set()) {
        if (name === "picomatch") return approvedPicomatchAdvisory;
        if (trail.has(name)) return false;
        const vulnerability = vulnerabilities[name];
        if (!vulnerability || !Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
          return false;
        }
        const nextTrail = new Set(trail);
        nextTrail.add(name);
        return vulnerability.via.every((dependency) =>
          typeof dependency === "string" && tracesOnlyToApprovedPicomatch(dependency, nextTrail)
        );
      }

      const unapproved = blocking
        .filter(([name]) => !tracesOnlyToApprovedPicomatch(name))
        .map(([name, vulnerability]) => ({
          name,
          severity: vulnerability.severity,
          range: vulnerability.range,
          via: vulnerability.via,
          fixAvailable: vulnerability.fixAvailable,
        }));

      if (!approvedPicomatchAdvisory) {
        fail("The picomatch advisory no longer matches the narrowly approved, unpatched state. Review and update dependencies; current picomatch data: " + JSON.stringify(picomatch ?? null));
      } else if (unapproved.length > 0) {
        fail("Unapproved moderate-or-higher vulnerabilities remain: " + JSON.stringify(unapproved));
      } else if (audit.status !== 0 && !audit.stdout) {
        fail("npm audit failed without a readable audit report: " + (audit.stderr || "unknown npm error"));
      } else {
        const inheritedCount = blocking.length - 1;
        console.warn(
          "[dependency-audit] npm reports one currently unpatched high-severity advisory (GHSA-fc5q-39xc-vjpf) in picomatch " +
          PICOMATCH_VERSION + "; " + inheritedCount +
          " affected dependency-path entr" + (inheritedCount === 1 ? "y is" : "ies are") +
          " inherited only from that advisory. No patched Picomatch version is published. npm's suggested Vite remediation crosses the project's locked Vite major and is not applied. " +
          "All other moderate/high/critical findings remain blocking. Upgrade Picomatch and remove this exception as soon as a fixed release is available."
        );
      }
    }
  }
}
