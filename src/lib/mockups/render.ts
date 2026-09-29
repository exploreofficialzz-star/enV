import type { DeviceTemplate, Message, MockupProject, ThemeTokens } from "./schema.ts";
import { PLATFORM_ADAPTERS } from "./platforms/registry.ts";
import { evaluateTimeline } from "./timeline.ts";

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));

function textWidth(text: string, size = 14) { return Math.min(330, Math.max(90, text.length * size * 0.52 + 34)); }

function statusBar(device: DeviceTemplate, tokens: ThemeTokens, fontFamily: string) {
  if (!device.statusBar) return "";
  return `<text x="18" y="20" font-size="10" font-family="${esc(fontFamily)}" fill="${tokens.text}">9:41</text><text x="${device.width - 70}" y="20" font-size="9" font-family="${esc(fontFamily)}" fill="${tokens.secondaryText}">▮▮▮  Wi-Fi  ▰</text>`;
}

function cutout(device: DeviceTemplate, tokens: ThemeTokens) {
  if (device.cutout === "dynamic-island") return `<rect x="${device.width / 2 - 58}" y="8" width="116" height="25" rx="13" fill="#050505"/>`;
  if (device.cutout === "notch") return `<path d="M${device.width / 2 - 72} 0h144v20c-12 18-30 22-72 22s-60-4-72-22z" fill="#050505"/>`;
  if (device.cutout === "punch-hole") return `<circle cx="${device.width / 2}" cy="18" r="6" fill="#050505"/>`;
  return "";
}

function navigation(device: DeviceTemplate, tokens: ThemeTokens) {
  if (device.navigationBar === "gesture") return `<rect x="${device.width / 2 - 52}" y="${device.height - 17}" width="104" height="4" rx="2" fill="${tokens.secondaryText}" opacity=".65"/>`;
  if (device.navigationBar === "three-button") return `<text x="${device.width / 2 - 38}" y="${device.height - 12}" font-size="11" fill="${tokens.secondaryText}">◁   ○   □</text>`;
  return "";
}

function messageBubble(message: Message, index: number, project: MockupProject, tokens: ThemeTokens, adapter: ReturnType<typeof getAdapter>) {
  const profile = project.profiles.find((p) => p.id === message.profileId) ?? project.profiles[0];
  const ui = adapter.ui;
  const mine = message.profileId === "me";
  const max = project.deviceTemplate.startsWith("iphone") || project.deviceTemplate.startsWith("android") ? 330 : 600;
  const bubbleW = Math.min(max, textWidth(message.text ?? (message.media?.[0]?.name ?? "Message")));
  const x = mine ? maxDeviceWidth(project) - bubbleW - 14 : 14;
  const y = 104 + index * (message.media?.length ? 88 : 64);
  const fill = mine ? tokens.outgoing : tokens.incoming;
  const lines = (message.text ?? (message.deleted ? "This message was deleted" : "")).slice(0, 110);
  const media = (message.media ?? []).map((asset, i) => {
    if (asset.kind === "image" || asset.kind === "gif" || asset.kind === "video") {
      const source = asset.thumbnailUrl ?? asset.url;
      const fit = asset.objectFit ?? "cover";
      const preserve = fit === "contain" ? "xMidYMid meet" : fit === "fill" ? "none" : "xMidYMid slice";
      const crop = asset.crop;
      const href = esc(source);
      const label = asset.kind === "video" ? `Video · ${asset.durationMs ? Math.round(asset.durationMs / 1000) : 0}s` : asset.kind === "gif" ? "GIF" : asset.name;
      const cropTitle = crop ? "<title>Crop " + crop.x + "," + crop.y + "," + crop.width + "," + crop.height + "</title>" : "";
      return "<clipPath id=\"media-" + esc(asset.id) + "\"><rect x=\"" + (x + 8) + "\" y=\"" + (y + 8) + "\" width=\"" + (bubbleW - 16) + "\" height=\"42\" rx=\"7\"/></clipPath>" +
        "<image href=\"" + href + "\" x=\"" + (x + 8) + "\" y=\"" + (y + 8) + "\" width=\"" + (bubbleW - 16) + "\" height=\"42\" preserveAspectRatio=\"" + preserve + "\" clip-path=\"url(#media-" + esc(asset.id) + ")\"/>" +
        "<text x=\"" + (x + 14) + "\" y=\"" + (y + 45) + "\" font-size=\"8\" fill=\"" + tokens.secondaryText + "\">" + esc(label) + "</text>" + cropTitle;
    }
    if (asset.kind === "audio") {
      const bars = (asset.waveform ?? Array.from({ length: 28 }, (_, n) => 0.25 + ((n * 17) % 11) / 20)).slice(0, 28).map((v, n) => `<rect x="${x + 12 + n * 5}" y="${y + 18 - v * 9}" width="2" height="${Math.max(3, v * 18)}" rx="1" fill="${tokens.accent}"/>`).join("");
      return `<text x="${x + 12}" y="${y + 14}" font-size="9" fill="${tokens.secondaryText}">Voice note · ${asset.durationMs ? Math.round(asset.durationMs / 1000) : 0}s</text>${bars}`;
    }
    return `<text x="${x + 12}" y="${y + 24 + i * 14}" font-size="10" fill="${tokens.text}">${esc(asset.name)}</text>`;
  }).join("");
  const reply = message.replyTo ? project.messages.find((m) => m.id === message.replyTo) : undefined;
  const reaction = message.reactions?.length ? `<text x="${x + bubbleW - 30}" y="${y + 48}" font-size="10">${esc(message.reactions.map((r) => r.emoji).join(""))}</text>` : "";
  const meta = `${esc(adapter.renderMessageMeta(message))}${message.edited ? " · edited" : ""}`;
  const checks = mine ? `<text x="${x + bubbleW - 28}" y="${y + 42}" font-size="9" fill="${message.state === "read" ? tokens.accent : tokens.secondaryText}">${message.state === "read" ? "✓✓" : message.state === "delivered" ? "✓✓" : "✓"}</text>` : "";
  const replyBlock = reply ? `<rect x="${x + 8}" y="${y + 7}" width="${bubbleW - 16}" height="18" rx="4" fill="${tokens.separator}" opacity=".6"/><text x="${x + 13}" y="${y + 20}" font-size="8" fill="${tokens.secondaryText}">${esc(reply.text?.slice(0, 38) ?? "Reply")}</text>` : "";
  return `<g><rect x="${x}" y="${y}" width="${bubbleW}" height="${message.media?.length ? 70 : 52}" rx="${ui.bubbleStyle === "pill" ? Math.min(adapter.messageRadius + 8, 28) : ui.bubbleStyle === "square" ? 4 : ui.bubbleStyle === "plain" ? 2 : adapter.messageRadius}" fill="${fill}"/>${replyBlock}${media}<text x="${x + 12}" y="${y + (reply ? 39 : 22)}" font-size="13" font-family="${esc(ui.fontFamily)}" fill="${tokens.text}">${esc(lines)}</text><text x="${x + 12}" y="${y + (message.media?.length ? 63 : 41)}" font-size="8" fill="${tokens.secondaryText}">${meta}</text>${checks}${reaction}<title>${esc(profile.name)}</title></g>`;
}

function maxDeviceWidth(project: MockupProject) { return project.exportSettings.width ?? (project.deviceTemplate.includes("ipad") ? 820 : project.deviceTemplate.includes("browser") ? 1440 : 390); }
function getAdapter(platform: MockupProject["platform"]) { return PLATFORM_ADAPTERS[platform]; }

export function renderProjectSvg(project: MockupProject, device: DeviceTemplate, tokens: ThemeTokens, atMs = Number.POSITIVE_INFINITY) {
  const adapter = getAdapter(project.platform);
  const w = project.exportSettings.width ?? device.width;
  const h = project.exportSettings.height ?? device.height;
  const profile = project.profiles.find((p) => p.id === "them") ?? project.profiles[0];
  const ui = adapter.ui;
  const timeline = evaluateTimeline(project, atMs);
  const visibleMessages = project.messages.filter((m) => timeline.visibleMessageIds.has(m.id));
  const timelineProject = { ...project, messages: visibleMessages.map((m) => timeline.readMessageIds.has(m.id) ? { ...m, state: "read" as const } : m) };
  const scale = Math.max(1, project.exportSettings.scale);
  const header = adapter.renderHeader(profile, tokens);
  const dateLabels = [...new Set(project.messages.map((m) => m.dateLabel).filter(Boolean))];
  const notices = header.notice ? `<text x="18" y="${device.safeTopPx + 68}" font-size="8" text-anchor="start" fill="${tokens.secondaryText}">${esc(header.notice)}</text>` : "";
  const body = project.scene === "notification"
    ? `<rect x="18" y="${device.safeTopPx + 55}" width="${w - 36}" height="86" rx="16" fill="${tokens.surface}"/><circle cx="48" cy="${device.safeTopPx + 98}" r="16" fill="${tokens.accent}"/><text x="76" y="${device.safeTopPx + 92}" font-size="13" font-weight="600" fill="${tokens.text}">${esc(adapter.name)}</text><text x="76" y="${device.safeTopPx + 113}" font-size="11" fill="${tokens.secondaryText}">${esc(timelineProject.messages[timelineProject.messages.length - 1]?.text ?? "New notification")}</text>`
    : project.scene === "video"
      ? `<rect x="12" y="${device.safeTopPx + 58}" width="${w - 24}" height="${Math.min(h * .62, 520)}" rx="18" fill="#101010"/><circle cx="${w / 2}" cy="${device.safeTopPx + 190}" r="42" fill="${tokens.accent}"/><text x="${w / 2 - 30}" y="${device.safeTopPx + 196}" font-size="12" fill="#fff">VIDEO</text><circle cx="${w / 2 - 48}" cy="${h - 105}" r="22" fill="#ffffff22"/><circle cx="${w / 2}" cy="${h - 105}" r="22" fill="#ff3b30"/><circle cx="${w / 2 + 48}" cy="${h - 105}" r="22" fill="#ffffff22"/>`
      : project.scene === "voice"
        ? `<text x="18" y="${device.safeTopPx + 82}" font-size="11" fill="${tokens.secondaryText}">VOICE NOTE</text>${messageBubble(timelineProject.messages.find((m) => m.media?.some((a) => a.kind === "audio")) ?? timelineProject.messages[0], 0, project, tokens, adapter)}`
        : project.scene === "post"
          ? `<text x="18" y="${device.safeTopPx + 82}" font-size="18" font-weight="700" fill="${tokens.text}">${esc(profile.name)}</text><text x="18" y="${device.safeTopPx + 108}" font-size="12" fill="${tokens.secondaryText}">@${esc(profile.username ?? "user")}</text>${timelineProject.messages.slice(0, 3).map((m, i) => messageBubble(m, i, project, tokens, adapter)).join("")}`
          : timelineProject.messages.map((m, i) => {
              const separator = m.dateLabel ? `<text x="${w / 2}" y="${device.safeTopPx + 82 + i * 64}" font-size="8" text-anchor="middle" fill="${tokens.secondaryText}">${esc(m.dateLabel)}</text>` : "";
              const unread = m.unread ? `<rect x="${w - 82}" y="${device.safeTopPx + 74 + i * 64}" width="64" height="18" rx="9" fill="${tokens.accent}"/><text x="${w - 50}" y="${device.safeTopPx + 86 + i * 64}" font-size="7" text-anchor="middle" fill="#fff">UNREAD</text>` : "";
              const pinned = m.pinned ? `<text x="${w - 28}" y="${device.safeTopPx + 92 + i * 64}" font-size="9" fill="${tokens.secondaryText}">●</text>` : "";
              return separator + unread + pinned + messageBubble(m, i, project, tokens, adapter);
            }).join("");
  const typing = (project.scene === "typing" || timeline.typing) ? `<rect x="14" y="${Math.min(h - 95, 104 + project.messages.length * 64)}" width="76" height="30" rx="15" fill="${tokens.incoming}"/><text x="31" y="${Math.min(h - 75, 124 + project.messages.length * 64)}" font-size="12" fill="${tokens.secondaryText}">•••</text>` : "";
  const receipt = project.scene === "receipt" ? `<text x="${w - 110}" y="${h - 68}" font-size="10" fill="${tokens.secondaryText}">Read ${esc(project.messages.at(-1)?.timestamp ?? "now")}</text>` : "";
  const composer = ["chat", "conversation", "group", "typing", "receipt"].includes(project.scene) ? `<rect x="0" y="${h - device.safeBottomPx - 54}" width="${w}" height="54" fill="${tokens.header}"/><rect x="12" y="${h - device.safeBottomPx - 43}" width="${w - 24}" height="32" rx="${ui.composerStyle === "pill" ? 16 : ui.composerStyle === "email" ? 4 : 10}" fill="${tokens.background}"/><text x="26" y="${h - device.safeBottomPx - 23}" font-size="11" fill="${tokens.secondaryText}">Message</text>` : "";
  const screen = `<rect x="0" y="0" width="${w}" height="${h}" rx="${device.radiusPx}" fill="${tokens.background}"/><rect x="0" y="${device.safeTopPx}" width="${w}" height="${ui.headerHeight}" fill="${tokens.header}"/><circle cx="32" cy="${device.safeTopPx + ui.headerHeight / 2}" r="17" fill="${tokens.accent}"/><text x="58" y="${device.safeTopPx + ui.headerHeight / 2 - 3}" font-size="14" font-weight="600" fill="${tokens.text}">${esc(profile.name)}</text><text x="58" y="${device.safeTopPx + ui.headerHeight / 2 + 14}" font-size="9" fill="${tokens.secondaryText}">${esc(header.subtitle)}</text>${statusBar(device, tokens, ui.fontFamily)}${cutout(device, tokens)}${notices}${body}${typing}${receipt}${composer}${navigation(device, tokens)}`;
  const frameFill = device.darkFrame ? "#090909" : "#d6d6d8";
  const outerW = w + device.bezelPx * 2;
  const outerH = h + device.bezelPx * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW * scale}" height="${outerH * scale}" viewBox="0 0 ${outerW} ${outerH}"><rect width="${outerW}" height="${outerH}" rx="${device.radiusPx + device.bezelPx}" fill="${frameFill}"/><g transform="translate(${device.bezelPx},${device.bezelPx})">${screen}</g></svg>`;
}
