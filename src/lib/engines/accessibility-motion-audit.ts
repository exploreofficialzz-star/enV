export type MotionSeverity = "critical" | "serious" | "moderate" | "minor";

export interface MotionFinding {
  severity: MotionSeverity;
  rule: string;
  message: string;
  element: string;
  fix: string;
}

function push(findings: MotionFinding[], severity: MotionSeverity, rule: string, message: string, element: string, fix: string) {
  findings.push({ severity, rule, message, element, fix });
}

/**
 * Extract a balanced CSS block after a regular-expression match. This is a
 * deliberately small static-analysis helper, not a complete CSS parser; it
 * handles nested rule blocks and avoids treating the mere presence of a media
 * query as proof that every motion source is covered.
 */
function extractCssBlock(source: string, pattern: RegExp): { name: string; body: string } | null {
  const match = pattern.exec(source);
  if (!match) return null;
  const open = source.indexOf("{", match.index + match[0].length);
  if (open < 0) return null;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { name: match[1] ?? match[0], body: source.slice(open + 1, i) };
    }
  }
  return null;
}

export function inspectMotionMarkup(markup: string): MotionFinding[] {
  const findings: MotionFinding[] = [];
  const css = markup.replace(/\/\*[\s\S]*?\*\//g, "");
  const animated = /\banimation(?:-name)?\s*:|@(?:-webkit-)?keyframes|\btransition(?:-property)?\s*:/i.test(css);
  const reducedBlock = extractCssBlock(css, /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce[^)]*\)/i);
  const reducedBody = reducedBlock?.body ?? "";
  const jsMotion = /(?:addEventListener\s*\(\s*['"](?:scroll|wheel|pointermove|mousemove|touchmove)['"]|requestAnimationFrame\s*\(|setInterval\s*\()[\s\S]{0,500}(?:transform|translate|rotate|scale|animation|style\.)/i.test(markup)
    || /\.style\.(?:transform|translate|rotate|scale)\s*=|\.animate\s*\(/i.test(markup);

  if (animated && !reducedBlock) {
    push(findings, "serious", "reduced-motion", "Motion CSS is present but no prefers-reduced-motion: reduce block was found.", "CSS animation/transition", "Provide a reduced-motion alternative that removes non-essential movement, disables smooth scrolling, and preserves essential information.");
  } else if (animated && reducedBlock) {
    const hasAnimationOverride = /\banimation\s*:\s*none\b|\banimation-name\s*:\s*none\b|\banimation-duration\s*:\s*(?:0(?:\.0+)?(?:ms|s)|0?\.0*1ms|1ms)\b|\banimation-iteration-count\s*:\s*1\b/i.test(reducedBody);
    const hasTransitionOverride = /\btransition\s*:\s*none\b|\btransition-property\s*:\s*none\b|\btransition-duration\s*:\s*(?:0(?:\.0+)?(?:ms|s)|0?\.0*1ms|1ms)\b/i.test(reducedBody);
    const hasMotionAnimation = /\banimation(?:-name)?\s*:/i.test(css) || /@(?:-webkit-)?keyframes/i.test(css);
    const hasMotionTransition = /\btransition(?:-property)?\s*:/i.test(css);
    if ((hasMotionAnimation && !hasAnimationOverride) || (hasMotionTransition && !hasTransitionOverride)) {
      push(findings, "moderate", "reduced-motion-incomplete", "A reduced-motion media query exists, but the block does not visibly override every animation/transition type used by this snippet.", "@media (prefers-reduced-motion: reduce)", "Inspect the declarations inside the media block and disable or materially reduce the non-essential animation and transition types actually used.");
    }
  }

  if (/\bscroll-behavior\s*:\s*smooth\b/i.test(css) && !/\bscroll-behavior\s*:\s*auto\b/i.test(reducedBody)) {
    push(findings, "moderate", "smooth-scroll-not-reduced", "Smooth scrolling is enabled but the reduced-motion block does not switch it to auto.", "html/body scroll behavior", "Set scroll-behavior: auto in the reduced-motion block and verify script-driven scrolling too.");
  }

  if (/\btransition\s*:\s*all\b/i.test(css)) {
    push(findings, "minor", "transition-all", "A broad transition: all declaration may animate properties that were not intended to move.", "CSS transition declaration", "List the specific properties that need transitions, and respect reduced-motion preferences for each.");
  }

  const keyframes: Array<{ name: string; body: string }> = [];
  const keyframePattern = /@(?:-webkit-)?keyframes\s+([\w-]+)/gi;
  let keyframeMatch: RegExpExecArray | null;
  while ((keyframeMatch = keyframePattern.exec(css))) {
    const block = extractCssBlock(css.slice(keyframeMatch.index), /^@(?:-webkit-)?keyframes\s+([\w-]+)/i);
    if (block) keyframes.push({ name: keyframeMatch[1], body: block.body });
  }

  for (const frame of keyframes) {
    const escapedName = frame.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`\\b${escapedName}\\b`, "i");
    const matchingRule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((rule) => {
      const body = rule[2] ?? "";
      const animationValues = [
        body.match(/\banimation\s*:\s*([^;]+)/i)?.[1],
        body.match(/\banimation-name\s*:\s*([^;]+)/i)?.[1],
      ].filter((value): value is string => Boolean(value));
      return animationValues.some((value) => value.split(",").some((part) => namePattern.test(part)));
    });
    const animationDecl = matchingRule?.[2] ?? "";
    const shorthand = animationDecl.match(/\banimation\s*:\s*([^;]+)/i)?.[1] ?? "";
    const animationItem = shorthand.split(",").find((part) => namePattern.test(part));
    const duration = (animationItem ?? animationDecl).match(/(?:^|\s)(\d*\.?\d+)(ms|s)\b/i)
      ?? animationDecl.match(/\banimation-duration\s*:\s*(\d*\.?\d+)(ms|s)\b/i);
    const milliseconds = duration ? Number(duration[1]) * (duration[2].toLowerCase() === "s" ? 1000 : 1) : null;
    const repeats = /\binfinite\b/i.test(animationItem ?? "")
      || /\banimation-iteration-count\s*:\s*(?:infinite|[2-9]|[1-9]\d+)\b/i.test(animationDecl);
    const hasHighContrastColor = /\b(?:red|black|white|yellow|lime|fuchsia)\b/i.test(frame.body)
      || /#(?:f00|000|fff|ff0|0f0|f0f|ff0000|000000|ffffff|ffff00|00ff00|ff00ff)\b/i.test(frame.body);
    const switchesHighContrastColors = (frame.body.match(/\bbackground(?:-color)?\s*:/gi) ?? []).length >= 2 && hasHighContrastColor;
    if (switchesHighContrastColors && repeats && milliseconds !== null && milliseconds <= 500) {
      push(findings, "serious", "rapid-contrast-flash", `Keyframes “${frame.name}” rapidly alternate high-contrast background colors (${milliseconds}ms per cycle). This is a risk signal, not a measured WCAG flash test.`, `@keyframes ${frame.name}`, "Remove the flashing effect or measure it against WCAG flash thresholds; do not assume reduced duration alone makes flashing safe.");
    }

    if (/translateX\s*\(/i.test(frame.body) && repeats) {
      push(findings, "moderate", "auto-moving-content", `Keyframes “${frame.name}” move content horizontally in a repeating animation.`, `@keyframes ${frame.name}`, "Provide an accessible pause/stop mechanism for automatically moving content and disable non-essential movement for reduced-motion users.");
    }
  }

  if (/(?:\banimation\s*:[^;{}]*\binfinite\b|\banimation-iteration-count\s*:\s*infinite\b)/i.test(css) && !/\banimation-play-state\s*:\s*paused\b/i.test(css) && !/\.classList\.(?:add|remove|toggle)\s*\([^)]*(?:pause|paused|motion-off|animation-off)/i.test(markup)) {
    push(findings, "moderate", "loop-without-pause", "One or more animations loop indefinitely, and no clear animation pause/resume mechanism was detected in the supplied code.", "CSS infinite animation", "Provide a user-operable pause/stop control for persistent movement. A generic stop button is only sufficient if it actually stops each affected animation.");
  }

  if (jsMotion) {
    push(findings, "moderate", "script-driven-motion", "JavaScript appears to change transform/animation state in response to events or an animation loop; CSS media-query overrides do not automatically stop this code path.", "JavaScript motion handler", "Guard non-essential script-driven motion with matchMedia('(prefers-reduced-motion: reduce)') and listen for preference changes; provide a static alternative.");
    if (!/matchMedia\s*\([^)]*prefers-reduced-motion/i.test(markup)) {
      push(findings, "moderate", "script-motion-not-preference-aware", "No JavaScript check for prefers-reduced-motion was detected alongside script-driven movement.", "JavaScript motion handler", "Use window.matchMedia('(prefers-reduced-motion: reduce)') before starting script-driven movement and update behavior when the preference changes.");
    }
  }

  // Concurrent animations that both write transform overwrite one another;
  // the resulting motion can differ from the designer's intent.
  for (const elementRule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const animationValue = elementRule[2].match(/\banimation\s*:\s*([^;]+)/i)?.[1];
    if (!animationValue) continue;
    const names = keyframes.map((frame) => frame.name).filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(animationValue));
    const transformWriters = names.filter((name) => keyframes.find((frame) => frame.name === name && /\btransform\s*:/i.test(frame.body)));
    if (transformWriters.length > 1) {
      push(findings, "moderate", "competing-transform-animations", `Multiple simultaneous keyframes (${transformWriters.join(", ")}) write to transform; they may override each other's motion.`, elementRule[1].trim(), "Combine transform operations into one keyframe animation or wrap effects in separate nested elements.");
    }
  }

  return findings;
}
