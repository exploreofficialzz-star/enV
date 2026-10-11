export function parseYtDlpJson(output) {
  const text = String(output ?? "").trim();
  if (!text) throw new Error("The downloader returned no metadata.");

  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const char = text[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const value = JSON.parse(text.slice(start, end + 1));
            if (value && typeof value === "object" && !Array.isArray(value)) return value;
          } catch {}
          break;
        }
      }
    }
  }
  throw new Error("The media provider returned invalid metadata.");
}
