export type MockupKind = 'chat' | 'group' | 'voice' | 'video' | 'notification' | 'typing' | 'receipt' | 'conversation';

export function parseMockupToolId(toolId: string) {
  const id = toolId.replace(/-mockup$/, '');
  const specialPlatforms: Record<string, MockupKind> = {
    "ai-chat": "chat",
    "threads": "chat",
    "tiktok-chat": "chat",
    "notification": "notification",
  };
  if (specialPlatforms[id]) return { platform: id === "threads" ? "threads" : id === "tiktok-chat" ? "tiktok-chat" : id, kind: specialPlatforms[id] };
  const suffixes: Array<[string, MockupKind]> = [
    ['-group-chat', 'group'], ['-voice-note', 'voice'], ['-video-call', 'video'],
    ['-notification', 'notification'], ['-typing-indicator', 'typing'], ['-read-receipt', 'receipt'],
    ['-conversation', 'conversation'], ['-chat', 'chat'],
  ];
  for (const [suffix, kind] of suffixes) {
    if (id.endsWith(suffix)) return { platform: id.slice(0, -suffix.length), kind };
  }
  return { platform: id, kind: 'chat' as MockupKind };
}

export function normalizeMockupPlatform(platform: string) {
  if (platform === "reddit-chat") return "reddit";
  if (platform === "tiktok-chat") return "tiktok-chat";
  if (platform === "x") return "x-dm";
  if (platform === "google") return "google-messages";
  if (platform === "instagram") return "instagram-dm";
  if (platform === "ai") return "ai-chat";
  if (platform === "threads-dm") return "threads";
  if (platform === "threads") return "threads";
  if (platform === "tiktok") return "tiktok-chat";
  return platform;
}

export function normalizeMessages(value: string) {
  return value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((line, i) => {
    const match = line.match(/^(me|them|other|you)\s*:\s*(.*)$/i);
    return { side: match && /^(me|you)$/i.test(match[1]) ? 'me' : i % 2 ? 'me' : 'them', text: match ? match[2] : line } as const;
  });
}

export function buildMockupModel(toolId: string, values: Record<string, string>) {
  const parsed = parseMockupToolId(toolId);
  const platform = values.platform?.trim() || parsed.platform || 'Messaging';
  const title = values.title?.trim() || (parsed.kind === 'notification' ? 'New notification' : values.them?.trim() || 'Demo conversation');
  const messages = normalizeMessages(values.messages || 'them: Hello there!\nme: This is a fictional mockup.');
  return { ...parsed, platform, title, messages, sender: values.sender?.trim() || 'Alex', status: values.status?.trim() || 'Delivered' };
}
