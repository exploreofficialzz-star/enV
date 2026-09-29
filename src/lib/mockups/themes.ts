import type { MockupPlatform, ThemeDefinition, ThemeTokens } from "./schema.ts";

const themes: ThemeDefinition[] = [
  { id: "light", name: "Light", tokens: { background: "#f5f6f7", surface: "#ffffff", text: "#111111", secondaryText: "#667085", accent: "#075e54", outgoing: "#dcf8c6", incoming: "#ffffff", separator: "#e5e7eb", status: "#667085", header: "#ffffff" } },
  { id: "dark", name: "Dark", tokens: { background: "#111b21", surface: "#202c33", text: "#e9edef", secondaryText: "#aebac1", accent: "#202c33", outgoing: "#005c4b", incoming: "#202c33", separator: "#334047", status: "#aebac1", header: "#202c33" } },
  { id: "system", name: "System", tokens: { background: "#f5f6f7", surface: "#ffffff", text: "#111111", secondaryText: "#667085", accent: "#075e54", outgoing: "#dcf8c6", incoming: "#ffffff", separator: "#e5e7eb", status: "#667085", header: "#ffffff" } },
];

export const THEME_MAP = new Map(themes.map((theme) => [theme.id, theme]));

export function platformTheme(platform: MockupPlatform, theme: "light" | "dark" | "system") {
  const base = THEME_MAP.get(theme === "system" ? "light" : theme)!;
  const overrides = ({
    "imessage": { accent: "#1c1c1e", outgoing: "#0b84ff", incoming: theme === "dark" ? "#2c2c2e" : "#e9e9eb" },
    "instagram-dm": { accent: "#000000", background: "#000000", outgoing: "#3797f0", incoming: "#262626" },
    "messenger": { accent: "#ffffff", outgoing: "#0084ff", incoming: "#e4e6eb" },
    "telegram": { accent: "#17212b", background: "#0e1621", outgoing: "#2b5278", incoming: "#182533" },
    "discord": { accent: "#2b2d31", background: "#313338", outgoing: "#5865f2", incoming: "#2b2d31" },
    "x-dm": { accent: "#000000", background: "#000000", outgoing: "#1d9bf0", incoming: "#202327" },
    "signal": { accent: "#121212", background: "#1a1a1a", outgoing: "#2c6bed", incoming: "#3b3b3b" },
    "slack": { accent: "#350d36", outgoing: "#1264a3", incoming: "#eeeeee" },
    "linkedin-dm": { accent: "#ffffff", background: "#f3f2ef", outgoing: "#0a66c2", incoming: "#ffffff" },
    "reddit": { accent: "#1a1a1b", background: "#1a1a1b", outgoing: "#d93a00", incoming: "#272729" },
    "tinder": { accent: "#111111", background: "#111111", outgoing: "#fe3c72", incoming: "#222222" },
    "tiktok-chat": { accent: "#000000", background: "#000000", outgoing: "#fe2c55", incoming: "#1f1f1f" },
    "threads": { accent: "#000000", background: "#000000", outgoing: "#ffffff", incoming: "#1e1e1e" },
    "ai-chat": { accent: "#171b1e", background: "#0e1114", outgoing: "#0d9f8a", incoming: "#171b1e" },
    "outlook": { accent: "#0078d4", outgoing: "#dbeafe", incoming: "#ffffff" },
  } as Record<MockupPlatform, Partial<ThemeTokens>>)[platform] ?? {};
  return { ...base, tokens: { ...base.tokens, ...overrides } };
}
