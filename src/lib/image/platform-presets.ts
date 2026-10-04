import type { PlatformPlacementSpec } from "./types.ts";

/**
 * Platform placement registry (shared by every social/platform image tool).
 *
 * Each entry states how sure we are, and the UI shows it:
 *  - "official"    – confirmed on the platform's own help page
 *  - "documented"  – the platform's own figures as quoted consistently by current guides, or consistent across those guides
 *  - "approximate" – the platform publishes no spec (or has no such placement); a sensible composition is offered and
 *                    labelled as such — never presented as a platform requirement
 *
 * Dimensions are *export* sizes. Variants list other valid shapes (first = default). Checked 2026-09-30.
 */

export type PlatformId = "instagram" | "facebook" | "x" | "linkedin" | "pinterest" | "tiktok" | "reddit" | "snapchat" | "threads" | "twitch" | "youtube" | "discord";
export type PlacementId = "profile" | "banner" | "cover" | "post" | "story" | "thumbnail" | "square" | "portrait" | "landscape" | "image";
export type Confidence = "official" | "documented" | "approximate";
export type OutFormat = "jpeg" | "png" | "webp";

export interface PlacementVariant { label: string; width: number; height: number }
export interface Zone { x: number; y: number; width: number; height: number; label: string }

export interface Placement {
  platform: PlatformId;
  placement: PlacementId;
  label: string;
  variants: PlacementVariant[];
  minWidth?: number;
  minHeight?: number;
  /** Largest upload the platform accepts, when documented (bytes). */
  maxBytes?: number;
  /** Size to stay under for fast loading (bytes). */
  recommendedBytes?: number;
  shape: "rect" | "circle";
  /** Content-safe area, fractions of the default variant. */
  safe?: Zone;
  /** Areas other UI usually covers, fractions of the default variant. */
  keepClear?: Zone[];
  formats: OutFormat[];
  /** false = the platform has no dedicated placement of this kind; the closest documented composition is offered. */
  exists: boolean;
  confidence: Confidence;
  basis: string;
  note: string;
}

export interface PlatformInfo { id: PlatformId; name: string; sourceUrl: string; sourceLabel: string; verified: string }

export const SPEC_VERIFIED_ON = "2026-09-30";

const info = (id: PlatformId, name: string, sourceUrl: string, sourceLabel: string): PlatformInfo => ({ id, name, sourceUrl, sourceLabel, verified: SPEC_VERIFIED_ON });

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  instagram: info("instagram", "Instagram", "https://help.instagram.com/1631821640426723", "Instagram Help Center"),
  facebook: info("facebook", "Facebook", "https://www.facebook.com/business/help", "Meta Business Help Center"),
  x: info("x", "X", "https://help.x.com/en/managing-your-account/how-to-customize-your-profile", "X Help Center"),
  linkedin: info("linkedin", "LinkedIn", "https://www.linkedin.com/help/linkedin/answer/a1357804", "LinkedIn Help"),
  pinterest: info("pinterest", "Pinterest", "https://business.pinterest.com/creative-best-practices/", "Pinterest Business creative guide"),
  tiktok: info("tiktok", "TikTok", "https://ads.tiktok.com/business/creativecenter/inspiration/topads", "TikTok Creative Center"),
  reddit: info("reddit", "Reddit", "https://support.reddithelp.com/", "Reddit Help"),
  snapchat: info("snapchat", "Snapchat", "https://forbusiness.snapchat.com/", "Snap for Business"),
  threads: info("threads", "Threads", "https://help.instagram.com/", "Instagram / Threads Help"),
  twitch: info("twitch", "Twitch", "https://help.twitch.tv/s/article/profile-settings", "Twitch Help"),
  youtube: info("youtube", "YouTube", "https://support.google.com/youtube/answer/10456525", "YouTube Help"),
  discord: info("discord", "Discord", "https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles", "Discord Support"),
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];
export const PLACEMENT_IDS: PlacementId[] = ["profile", "banner", "cover", "post", "story", "thumbnail", "square", "portrait", "landscape", "image"];

const MB = 1024 * 1024;
type V = [number, number, string];
type Z = [number, number, number, number, string];
interface Row {
  v: V[]; label: string; c: Confidence; basis: string; note?: string; exists?: boolean;
  min?: [number, number]; max?: number; rec?: number; circle?: boolean; safe?: Z; clear?: Z[]; fmt?: OutFormat[];
}
const ALL: OutFormat[] = ["jpeg", "png", "webp"];
const JP: OutFormat[] = ["jpeg", "png"];
const NOSPEC = "The platform publishes no dedicated spec for this placement; this is the closest documented composition.";
const VERTICAL_UI: Z = [0.05, 0.13, 0.9, 0.74, "Keep text out of the top and bottom ~250 px (app UI overlays)"];
const TIKTOK_UI: Z = [0.04, 0.08, 0.87, 0.78, "Keep clear of the caption area (bottom) and action buttons (right)"];
const PROFILE_OVERLAP: Z = [0, 0.5, 0.3, 0.5, "Profile picture usually overlaps here"];

const DATA: Record<PlatformId, Partial<Record<PlacementId, Row>>> = {
  instagram: {
    profile: { label: "Profile photo", v: [[320, 320, "1:1 (shown as a circle)"]], circle: true, c: "documented", basis: "Consistent across current Instagram size guides.", note: "Displayed as a circle — keep faces and logos centred." },
    post: { label: "Feed post", v: [[1080, 1350, "4:5 portrait"], [1080, 1080, "1:1 square"], [1080, 1440, "3:4 tall"], [1080, 566, "1.91:1 landscape"]], c: "documented", basis: "Feed accepts 1.91:1 to 3:4 (3:4 was added in 2025); 1080 px is the widest size served.", note: "The profile grid previews posts at 3:4, so keep key content away from the left and right edges.", safe: [0.03125, 0, 0.9375, 1, "Profile grid shows a centred 3:4 crop of 4:5 posts"] },
    portrait: { label: "Portrait post", v: [[1080, 1350, "4:5"], [1080, 1440, "3:4"]], c: "documented", basis: "4:5 is the long-standing portrait size; 3:4 was added in 2025.", note: "4:5 is the safest portrait size across feed and grid." },
    square: { label: "Square post", v: [[1080, 1080, "1:1"]], c: "documented", basis: "Standard square feed size.", note: "Squares are trimmed on the 3:4 profile grid." },
    landscape: { label: "Landscape post", v: [[1080, 566, "1.91:1"]], c: "documented", basis: "1.91:1 is Instagram's widest supported feed ratio." },
    story: { label: "Story / Reel", v: [[1080, 1920, "9:16"]], c: "documented", basis: "Full-screen vertical format for Stories and Reels.", safe: VERTICAL_UI, note: "Roughly the top and bottom 250 px are covered by app UI." },
    thumbnail: { label: "Reel cover", v: [[1080, 1920, "9:16 (grid shows centre 3:4)"]], c: "documented", basis: "Reel covers are 9:16 and the profile grid shows a centred 3:4 crop.", safe: [0, 0.125, 1, 0.75, "Centre 3:4 area shown on the profile grid"] },
    cover: { label: "Story highlight cover", v: [[1080, 1920, "9:16 (shown as a circle)"]], circle: true, c: "documented", basis: "Highlight covers are 9:16 uploads shown in a small circle.", safe: [0, 0.21875, 1, 0.5625, "Circle-safe centre square"] },
    banner: { label: "Banner (landscape post)", v: [[1080, 566, "1.91:1"]], exists: false, c: "approximate", basis: NOSPEC, note: "Instagram has no profile banner. This is the landscape feed size." },
  },
  facebook: {
    profile: { label: "Profile picture", v: [[400, 400, "1:1 (shown as a circle)"]], min: [180, 180], circle: true, c: "documented", basis: "Meta Help figures as quoted by current guides: shown at 170 px on computers and 128 px on phones; 180 px minimum.", note: "Cropped to a circle in most places." },
    banner: { label: "Cover photo", v: [[851, 315, "Recommended upload"], [1702, 630, "2× for sharper screens"], [820, 360, "One image for desktop + mobile"]], min: [400, 150], rec: 100 * 1024, c: "documented", basis: "Meta Help figures as quoted by current guides: shows 820×312 on computers and 640×360 on phones, 400×150 minimum; loads fastest as an sRGB JPG at 851×315 under 100 KB.", safe: [0.17, 0, 0.66, 1, "Visible on both computers and phones"], clear: [PROFILE_OVERLAP], note: "Phones crop the sides; desktop crops the top and bottom slightly." },
    cover: { label: "Cover photo", v: [[851, 315, "Recommended upload"], [1702, 630, "2× for sharper screens"], [820, 360, "One image for desktop + mobile"]], min: [400, 150], rec: 100 * 1024, c: "documented", basis: "Same placement as the Page/profile cover photo.", safe: [0.17, 0, 0.66, 1, "Visible on both computers and phones"], clear: [PROFILE_OVERLAP] },
    post: { label: "Feed post", v: [[1200, 630, "1.91:1 link / landscape"], [1080, 1350, "4:5 portrait"], [1080, 1080, "1:1 square"]], c: "documented", basis: "1200×630 is the standard shared-link image; feed photos display at 1080 px wide." },
    landscape: { label: "Landscape post", v: [[1200, 630, "1.91:1"]], c: "documented", basis: "1.91:1 shared-link / landscape image." },
    portrait: { label: "Portrait post", v: [[1080, 1350, "4:5"]], c: "documented", basis: "4:5 is the tallest ratio shown uncropped in feed." },
    square: { label: "Square post", v: [[1080, 1080, "1:1"]], c: "documented", basis: "Standard square feed size." },
    story: { label: "Story", v: [[1080, 1920, "9:16"]], c: "documented", basis: "Full-screen vertical format.", safe: VERTICAL_UI },
    thumbnail: { label: "Video thumbnail", v: [[1280, 720, "16:9"]], c: "documented", basis: "16:9 video thumbnail." },
  },
  x: {
    profile: { label: "Profile photo", v: [[400, 400, "1:1 (shown as a circle)"]], circle: true, max: 2 * MB, c: "documented", basis: "X Help Center figure (400×400); guides quote a 2 MB limit.", note: "Shown as a circle." },
    banner: { label: "Header photo", v: [[1500, 500, "3:1"]], max: 2 * MB, c: "documented", basis: "X Help Center figure (1500×500). File limit is quoted as 2 MB or 5 MB by different guides, so 2 MB is used to be safe.", safe: [0.05, 0.2, 0.9, 0.6, "Mobile crops the top and bottom"], clear: [PROFILE_OVERLAP] },
    cover: { label: "Header photo", v: [[1500, 500, "3:1"]], max: 2 * MB, c: "documented", basis: "Same placement as the header photo.", safe: [0.05, 0.2, 0.9, 0.6, "Mobile crops the top and bottom"] },
    post: { label: "Post image", v: [[1600, 900, "16:9"], [1080, 1080, "1:1"], [1080, 1350, "4:5"], [1200, 628, "1.91:1 link card"]], max: 5 * MB, c: "documented", basis: "X publishes no fixed post size; current guides agree 16:9 shows without cropping. 5 MB on mobile (15 MB on web).", note: "Single images are cropped in the timeline and shown in full when opened." },
    landscape: { label: "Landscape image", v: [[1600, 900, "16:9"]], max: 5 * MB, c: "documented", basis: "16:9 shows without cropping in the timeline." },
    portrait: { label: "Portrait image", v: [[1080, 1350, "4:5"]], max: 5 * MB, c: "approximate", basis: "Guides list 4:5 as supported; X does not publish it.", note: "Portrait images are cropped in the timeline." },
    square: { label: "Square image", v: [[1080, 1080, "1:1"]], max: 5 * MB, c: "documented", basis: "1:1 is supported for single images." },
    thumbnail: { label: "Link card image", v: [[1200, 628, "1.91:1"], [400, 400, "1:1 small card"]], max: 5 * MB, c: "documented", basis: "Summary-card image sizes agreed by current guides." },
    story: { label: "Vertical (9:16)", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: "X has no Stories; 9:16 is the vertical video/ad shape.", note: "X has no Stories placement; this is a vertical composition." },
  },
  linkedin: {
    profile: { label: "Profile photo", v: [[400, 400, "1:1 (shown as a circle)"], [800, 800, "2× for sharper screens"]], min: [400, 400], max: 8 * MB, circle: true, c: "documented", basis: "Guides agree: 400×400 minimum, up to 7680×4320, 8 MB, JPG/PNG.", note: "Displayed as a circle.", fmt: JP },
    banner: { label: "Profile background photo", v: [[1584, 396, "4:1"]], max: 8 * MB, c: "documented", basis: "1584×396 profile background (4:1), 8 MB.", clear: [[0, 0.3, 0.25, 0.7, "Profile photo overlaps here"]], fmt: JP },
    cover: { label: "Company page cover", v: [[1128, 191, "≈5.9:1"], [1584, 396, "Personal profile 4:1"]], max: 8 * MB, c: "documented", basis: "Company page cover is 1128×191 in current guides.", clear: [[0, 0.3, 0.25, 0.7, "Company logo overlaps here"]], fmt: JP },
    post: { label: "Feed image", v: [[1200, 627, "1.91:1"], [1200, 1200, "1:1"], [1080, 1350, "4:5"]], c: "documented", basis: "1200×627 link/landscape image; square 1200×1200 is supported." },
    landscape: { label: "Landscape image", v: [[1200, 627, "1.91:1"]], c: "documented", basis: "1200×627 is the standard landscape share image." },
    portrait: { label: "Portrait image", v: [[1080, 1350, "4:5"]], c: "approximate", basis: "Portrait images are supported; LinkedIn does not publish a fixed size." },
    square: { label: "Square image", v: [[1200, 1200, "1:1"]], c: "documented", basis: "Square 1200×1200 feed image." },
    thumbnail: { label: "Link / article image", v: [[1200, 627, "1.91:1"]], c: "documented", basis: "Link-preview image 1200×627." },
    story: { label: "Vertical (9:16)", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: "LinkedIn no longer offers Stories; 9:16 is the vertical video shape.", note: "LinkedIn has no Stories placement; this is a vertical composition." },
  },
  pinterest: {
    profile: { label: "Profile picture", v: [[600, 600, "1:1 (shown as a circle)"], [165, 165, "Display size"]], min: [160, 160], circle: true, c: "documented", basis: "Guides show a 165 px display size (160 px minimum); larger uploads look sharper.", note: "Cropped to a circle." },
    banner: { label: "Profile cover", v: [[1920, 1080, "16:9"], [800, 450, "Minimum"]], min: [800, 450], c: "documented", basis: "Profile cover is 16:9, at least 800×450.", note: "Pinterest crops covers differently on mobile and desktop." },
    cover: { label: "Profile cover", v: [[1920, 1080, "16:9"], [800, 450, "Minimum"]], min: [800, 450], c: "documented", basis: "Profile cover is 16:9, at least 800×450." },
    post: { label: "Pin", v: [[1000, 1500, "2:3 standard"], [1000, 1000, "1:1 square"], [1000, 2100, "1:2.1 longest"]], max: 20 * MB, c: "documented", basis: "Pinterest creative guidance: 2:3 (1000×1500) works best and pins taller than 1:2.1 are cut off. Up to 20 MB.", note: "Vertical pins get the most room in the feed." },
    portrait: { label: "Portrait pin", v: [[1000, 1500, "2:3"]], max: 20 * MB, c: "documented", basis: "2:3 is the recommended Pin shape." },
    square: { label: "Square pin", v: [[1000, 1000, "1:1"]], max: 20 * MB, c: "documented", basis: "Square pins are supported." },
    landscape: { label: "Landscape pin", v: [[1200, 900, "4:3"]], max: 20 * MB, c: "approximate", basis: "Pinterest supports wider pins but recommends vertical; 4:3 is a common wide size.", note: "Wide pins get less feed space than vertical pins." },
    story: { label: "Vertical pin (9:16)", v: [[1080, 1920, "9:16"]], max: 20 * MB, c: "documented", basis: "Vertical 9:16 pins (formerly Idea / Story Pins)." },
    thumbnail: { label: "Pin / video cover", v: [[1000, 1500, "2:3"]], max: 20 * MB, c: "approximate", basis: "Covers follow the 2:3 Pin shape; Pinterest has no separate thumbnail spec." },
  },
  tiktok: {
    profile: { label: "Profile photo", v: [[400, 400, "1:1 (shown as a circle)"]], min: [200, 200], max: 5 * MB, circle: true, fmt: JP, c: "documented", basis: "Guides agree: 200×200 minimum, 400×400+ looks sharper, JPG/PNG. The limit is quoted as 5–10 MB, so 5 MB is used.", note: "Shown as a circle everywhere." },
    post: { label: "Photo post (Photo Mode)", v: [[1080, 1920, "9:16"], [1080, 1080, "1:1"], [1920, 1080, "16:9"]], fmt: JP, c: "documented", basis: "Photo Mode recommends 1080×1920; square and landscape work but use less screen.", safe: TIKTOK_UI },
    portrait: { label: "Portrait photo", v: [[1080, 1920, "9:16"]], fmt: JP, c: "documented", basis: "TikTok is built around 9:16 vertical.", safe: TIKTOK_UI },
    story: { label: "Story", v: [[1080, 1920, "9:16"]], fmt: JP, c: "documented", basis: "Stories use the same 1080×1920 canvas.", safe: TIKTOK_UI },
    thumbnail: { label: "Video cover", v: [[1080, 1920, "9:16"]], fmt: JP, c: "documented", basis: "Uploaded covers use 1080×1920." },
    cover: { label: "Video cover", v: [[1080, 1920, "9:16"]], fmt: JP, c: "documented", basis: "Uploaded covers use 1080×1920.", note: "TikTok profiles have no banner; this is the video cover." },
    square: { label: "Square photo", v: [[1080, 1080, "1:1"]], fmt: JP, c: "documented", basis: "1:1 is supported for photos." },
    landscape: { label: "Landscape photo", v: [[1920, 1080, "16:9"]], fmt: JP, c: "documented", basis: "16:9 is supported but shown smaller." },
    banner: { label: "Banner (vertical cover shape)", v: [[1080, 1920, "9:16"]], exists: false, fmt: JP, c: "approximate", basis: NOSPEC, note: "TikTok profiles have no banner image. This is the vertical cover/post shape." },
  },
  reddit: {
    profile: { label: "Profile avatar", v: [[256, 256, "1:1 (shown as a circle)"]], circle: true, c: "approximate", basis: "Reddit publishes no avatar size; current guides consistently use 256×256.", note: "Shown as a circle." },
    banner: { label: "Community banner", v: [[1600, 480, "10:3 recommended"], [1920, 384, "5:1 wide"], [4000, 192, "Full-width monitors"]], c: "documented", basis: "Reddit's community guide as quoted by current guides: at least 1600×480 (Reddit Help lists 1072×128 desktop / 1080×128 mobile minimums).", note: "The banner is responsive — keep key content centred." },
    cover: { label: "Community banner", v: [[1600, 480, "10:3 recommended"], [1920, 384, "5:1 wide"]], c: "documented", basis: "Reddit's community guide as quoted by current guides: at least 1600×480." },
    post: { label: "Post image", v: [[1200, 675, "16:9"], [1080, 1080, "1:1"], [1080, 1350, "4:5"]], c: "approximate", basis: "Reddit does not publish organic post image sizes; these display without cropping in the feed.", note: "Reddit does not publish a fixed post-image size." },
    landscape: { label: "Landscape image", v: [[1200, 675, "16:9"]], c: "approximate", basis: "No official size; 16:9 displays without cropping in card view." },
    portrait: { label: "Portrait image", v: [[1080, 1350, "4:5"]], c: "approximate", basis: "Mobile shows 4:5; Reddit publishes no fixed portrait size." },
    square: { label: "Square image", v: [[1080, 1080, "1:1"]], c: "approximate", basis: "Mobile shows 1:1; Reddit publishes no fixed size." },
    thumbnail: { label: "Link thumbnail", v: [[400, 400, "1:1"]], exists: false, c: "approximate", basis: NOSPEC },
    story: { label: "Vertical (9:16)", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: "Reddit has no Stories.", note: "Reddit has no Stories placement; this is a vertical composition." },
  },
  snapchat: {
    story: { label: "Snap / Story", v: [[1080, 1920, "9:16"]], c: "documented", basis: "Snap for Business creative specs use 1080×1920 (9:16) for Snaps, Stories and Spotlight.", safe: [0.05, 0.13, 0.9, 0.7, "Keep clear of the top bar and bottom controls"] },
    post: { label: "Snap", v: [[1080, 1920, "9:16"]], c: "documented", basis: "Snapchat content is full-screen 9:16.", safe: [0.05, 0.13, 0.9, 0.7, "Keep clear of the top bar and bottom controls"] },
    portrait: { label: "Portrait", v: [[1080, 1920, "9:16"]], c: "documented", basis: "Full-screen 9:16." },
    thumbnail: { label: "Cover / thumbnail", v: [[1080, 1920, "9:16"]], c: "approximate", basis: NOSPEC },
    cover: { label: "Cover", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: NOSPEC },
    banner: { label: "Banner", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: NOSPEC, note: "Snapchat has no banner image; this is the full-screen shape." },
    profile: { label: "Profile picture", v: [[512, 512, "1:1"]], circle: true, exists: false, c: "approximate", basis: "Snapchat profile pictures are Bitmoji/avatars; no upload size is published.", note: "Snapchat publishes no profile-picture size." },
    square: { label: "Square", v: [[1080, 1080, "1:1"]], exists: false, c: "approximate", basis: NOSPEC },
    landscape: { label: "Landscape", v: [[1920, 1080, "16:9"]], exists: false, c: "approximate", basis: NOSPEC },
  },
  threads: {
    profile: { label: "Profile photo", v: [[320, 320, "1:1 (shown as a circle)"]], circle: true, c: "approximate", basis: "Threads reuses the Instagram profile photo and publishes no separate size; Instagram's 320 px is used.", note: "Shown as a circle." },
    post: { label: "Post image", v: [[1080, 1350, "4:5"], [1080, 1080, "1:1"], [1080, 566, "1.91:1"]], c: "approximate", basis: "Threads publishes no image sizes; it follows Instagram feed ratios.", note: "Threads does not publish a fixed image size." },
    portrait: { label: "Portrait image", v: [[1080, 1350, "4:5"]], c: "approximate", basis: "Follows Instagram feed ratios." },
    square: { label: "Square image", v: [[1080, 1080, "1:1"]], c: "approximate", basis: "Follows Instagram feed ratios." },
    landscape: { label: "Landscape image", v: [[1080, 566, "1.91:1"]], c: "approximate", basis: "Follows Instagram feed ratios." },
    story: { label: "Vertical (9:16)", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: "Threads has no Stories.", note: "Threads has no Stories placement; this is a vertical composition." },
    thumbnail: { label: "Thumbnail", v: [[1080, 1350, "4:5"]], exists: false, c: "approximate", basis: NOSPEC },
    cover: { label: "Cover", v: [[1080, 1350, "4:5"]], exists: false, c: "approximate", basis: NOSPEC },
    banner: { label: "Banner", v: [[1080, 566, "1.91:1"]], exists: false, c: "approximate", basis: NOSPEC, note: "Threads has no banner image." },
  },
  twitch: {
    profile: { label: "Profile picture", v: [[256, 256, "1:1 (shown as a circle)"]], min: [200, 200], max: 10 * MB, circle: true, c: "documented", basis: "Twitch size guides agree: 256×256 (200×200 minimum), up to 10 MB.", note: "Shown as a circle." },
    banner: { label: "Profile banner", v: [[1200, 480, "5:2"]], min: [900, 480], max: 10 * MB, c: "documented", basis: "Twitch guides agree: 1200×480, minimum width 900, up to 10 MB.", clear: [[0, 0.3, 0.3, 0.7, "Profile picture and channel info overlap the left"]] },
    cover: { label: "Offline / player banner", v: [[1920, 1080, "16:9"]], max: 10 * MB, c: "documented", basis: "Offline screen / video player banner is 1920×1080." },
    thumbnail: { label: "Stream / VOD thumbnail", v: [[1280, 720, "16:9"]], c: "documented", basis: "Thumbnails are 1280×720 (16:9)." },
    landscape: { label: "Landscape image", v: [[1920, 1080, "16:9"]], c: "documented", basis: "16:9 is the standard Twitch canvas." },
    post: { label: "Image (16:9)", v: [[1920, 1080, "16:9"]], exists: false, c: "approximate", basis: "Twitch has no image posts; 16:9 is the standard channel canvas." },
    square: { label: "Square image", v: [[1080, 1080, "1:1"]], exists: false, c: "approximate", basis: NOSPEC },
    portrait: { label: "Portrait image", v: [[1080, 1350, "4:5"]], exists: false, c: "approximate", basis: NOSPEC },
    story: { label: "Vertical (9:16)", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: "Twitch has no Stories.", note: "Twitch has no Stories placement; this is a vertical composition." },
  },
  youtube: {
    profile: { label: "Channel profile picture", v: [[800, 800, "1:1 (shown as a circle)"]], min: [98, 98], circle: true, c: "documented", basis: "Guides agree: 800×800 recommended, 98×98 minimum.", note: "Shown as a circle." },
    banner: { label: "Channel banner", v: [[2560, 1440, "16:9 recommended"], [2048, 1152, "16:9 minimum"]], min: [2048, 1152], max: 6 * MB, c: "official", basis: "YouTube Help: minimum 2048×1152 (16:9), recommended 2560×1440, text-and-logo safe area 1235×338, 6 MB or smaller.", safe: [0.2588, 0.3826, 0.4824, 0.2347, "1235×338 safe area visible on every device"], note: "Only the centre safe area is visible on every device." },
    cover: { label: "Channel banner", v: [[2560, 1440, "16:9 recommended"], [2048, 1152, "16:9 minimum"]], min: [2048, 1152], max: 6 * MB, c: "official", basis: "YouTube Help: same channel banner placement.", safe: [0.2588, 0.3826, 0.4824, 0.2347, "1235×338 safe area visible on every device"] },
    thumbnail: { label: "Video thumbnail", v: [[1280, 720, "16:9"]], min: [640, 360], max: 2 * MB, c: "documented", basis: "1280×720 (16:9), at least 640 px wide, under 2 MB — consistent across current YouTube guidance.", fmt: JP },
    landscape: { label: "Landscape image", v: [[1280, 720, "16:9"]], c: "documented", basis: "16:9 is YouTube's standard image shape." },
    post: { label: "Community post image", v: [[1080, 1080, "1:1"], [1280, 720, "16:9"]], c: "approximate", basis: "YouTube publishes no exact community-post image size; square and 16:9 both display well.", note: "YouTube does not publish a fixed community-post size." },
    portrait: { label: "Portrait (Shorts)", v: [[1080, 1920, "9:16"]], c: "documented", basis: "Shorts are vertical 9:16." },
    story: { label: "Shorts (9:16)", v: [[1080, 1920, "9:16"]], c: "documented", basis: "Shorts use 1080×1920." },
    square: { label: "Square image", v: [[1080, 1080, "1:1"]], c: "approximate", basis: NOSPEC },
  },
  discord: {
    profile: { label: "Avatar", v: [[512, 512, "1:1 (shown as a circle)"], [128, 128, "Display size"]], min: [128, 128], circle: true, c: "documented", basis: "Guides agree: avatars display at 128 px; 512×512 uploads stay sharp.", note: "Shown as a circle." },
    banner: { label: "Profile banner", v: [[680, 240, "17:6 (Nitro profile)"], [960, 540, "Server banner 16:9"], [1920, 1080, "Invite background 16:9"]], min: [600, 240], c: "documented", basis: "Discord Support lists custom profile banners; guides agree on 680×240 (600×240 minimum). Server banners are 960×540.", clear: [[0, 0.55, 0.25, 0.45, "Your avatar overlaps here"]] },
    cover: { label: "Server banner", v: [[960, 540, "16:9 (needs Server Boost)"], [1920, 1080, "Also accepted / invite background"]], c: "documented", basis: "Server banner 960×540 (16:9); requires Server Boost.", note: "Server banners require a boosted server." },
    post: { label: "Image in chat", v: [[1280, 720, "16:9"]], c: "approximate", basis: "Discord publishes no size for chat images; they are downscaled to fit the message column.", note: "Discord does not publish a fixed chat-image size." },
    landscape: { label: "Landscape image", v: [[1280, 720, "16:9"]], c: "approximate", basis: "No official size; 16:9 displays fully." },
    portrait: { label: "Portrait image", v: [[1080, 1350, "4:5"]], c: "approximate", basis: NOSPEC },
    square: { label: "Square image", v: [[1080, 1080, "1:1"]], c: "approximate", basis: NOSPEC },
    thumbnail: { label: "Server icon", v: [[512, 512, "1:1 (shown as a circle)"]], min: [128, 128], circle: true, c: "documented", basis: "Server icons: 512×512 recommended, 128×128 minimum.", note: "Used as the small square image Discord shows in lists." },
    story: { label: "Vertical (9:16)", v: [[1080, 1920, "9:16"]], exists: false, c: "approximate", basis: "Discord has no Stories.", note: "Discord has no Stories placement; this is a vertical composition." },
  },
};

const FALLBACK: PlacementId[] = ["post", "landscape", "square", "portrait"];
const CACHE = new Map<string, Placement>();

function build(platform: PlatformId, placement: PlacementId, row: Row): Placement {
  const zone = (z: Z): Zone => ({ x: z[0], y: z[1], width: z[2], height: z[3], label: z[4] });
  return {
    platform, placement, label: row.label, variants: row.v.map(([width, height, label]) => ({ width, height, label })),
    minWidth: row.min?.[0], minHeight: row.min?.[1], maxBytes: row.max, recommendedBytes: row.rec,
    shape: row.circle ? "circle" : "rect", safe: row.safe ? zone(row.safe) : undefined, keepClear: row.clear?.map(zone),
    formats: row.fmt ?? ALL, exists: row.exists !== false, confidence: row.c, basis: row.basis, note: row.note ?? "",
  };
}

/** Resolves a platform + placement. "image" (generic tools) resolves to the platform's main post shape. */
export function getPlacement(platform: PlatformId, placement: PlacementId): Placement | undefined {
  const key = `${platform}/${placement}`;
  const cached = CACHE.get(key);
  if (cached) return cached;
  const table = DATA[platform];
  if (!table) return undefined;
  let row = placement === "image" ? undefined : table[placement];
  let borrowed = false;
  if (!row) { for (const alt of FALLBACK) if (table[alt]) { row = table[alt]; borrowed = placement !== "image"; break; } }
  if (!row) return undefined;
  const built = build(platform, placement, row);
  if (borrowed) { built.exists = false; built.confidence = "approximate"; built.note = built.note || `${PLATFORMS[platform].name} has no dedicated ${placement} placement; this is its closest documented image shape.`; }
  CACHE.set(key, built);
  return built;
}

/** Distinct placements a platform offers (used by the placement picker). */
export function placementsFor(platform: PlatformId): Placement[] {
  const out: Placement[] = [];
  const seen = new Set<string>();
  for (const id of PLACEMENT_IDS) {
    if (id === "image") continue;
    const p = DATA[platform][id] ? getPlacement(platform, id) : undefined;
    if (!p) continue;
    const sig = `${p.label}|${p.variants[0].width}x${p.variants[0].height}`;
    if (seen.has(sig)) continue;
    seen.add(sig); out.push(p);
  }
  return out;
}

const PLACEMENT_WORDS: [RegExp, PlacementId][] = [[/profile/, "profile"], [/banner/, "banner"], [/cover/, "cover"], [/story/, "story"], [/thumbnail/, "thumbnail"], [/square/, "square"], [/portrait/, "portrait"], [/landscape/, "landscape"], [/post/, "post"]];

export interface ParsedPlatformOp { platform: PlatformId; placement: PlacementId; kind: "resizer" | "compressor" }

/** "discord-banner-resizer" → { discord, banner }; "x-image-compressor" → { x, image, compressor }. Null for non-platform ops. */
export function parsePlatformOp(op: string): ParsedPlatformOp | null {
  const m = op.toLowerCase().match(/^(instagram|facebook|x|linkedin|pinterest|tiktok|reddit|snapchat|threads|twitch|youtube|discord)-(.+)$/);
  if (!m) return null;
  const rest = m[2];
  if (!/(resizer|maker|compressor)$/.test(rest)) return null;
  if (/compressor$/.test(rest)) return { platform: m[1] as PlatformId, placement: "image", kind: "compressor" };
  for (const [re, id] of PLACEMENT_WORDS) if (re.test(rest)) return { platform: m[1] as PlatformId, placement: id, kind: "resizer" };
  return { platform: m[1] as PlatformId, placement: "image", kind: "resizer" };
}

/** Documented upload limits for a platform, for its compress tool. */
export function platformSizeCaps(platform: PlatformId): { label: string; bytes: number; placement: PlacementId }[] {
  const out: { label: string; bytes: number; placement: PlacementId }[] = [];
  for (const p of placementsFor(platform)) {
    const bytes = p.maxBytes ?? p.recommendedBytes;
    if (!bytes) continue;
    const label = `${p.label} — ${p.maxBytes ? "limit" : "recommended under"}`;
    if (!out.some((o) => o.bytes === bytes && o.label === label)) out.push({ label, bytes, placement: p.placement });
  }
  return out;
}

/* ---------- backwards-compatible exports (legacy engine, audit script and older tests) ---------- */

const ratioText = (w: number, h: number) => { const g = (a: number, b: number): number => (b ? g(b, a % b) : a); const d = g(w, h); return `${w / d}:${h / d}`; };

export const PLATFORM_PRESETS: PlatformPlacementSpec[] = PLATFORM_IDS.flatMap((platform) =>
  PLACEMENT_IDS.flatMap((contentType) => {
    const p = getPlacement(platform, contentType);
    if (!p) return [];
    const { width, height } = p.variants[0];
    return [{
      platform, contentType, version: SPEC_VERIFIED_ON, sourceUrl: PLATFORMS[platform].sourceUrl, lastVerified: SPEC_VERIFIED_ON,
      dimensions: { width, height }, aspectRatio: ratioText(width, height),
      minDimensions: p.minWidth && p.minHeight ? { width: p.minWidth, height: p.minHeight } : undefined, maxFileSizeBytes: p.maxBytes,
      allowedFormats: p.formats.map((f) => (f === "jpeg" ? "JPG" : f === "png" ? "PNG" : "WebP")), alphaAllowed: true,
      safeAreas: p.safe ? [{ x: p.safe.x * width, y: p.safe.y * height, width: p.safe.width * width, height: p.safe.height * height, unit: "px" as const }] : undefined,
      cropBehavior: "reposition" as const, notes: [`${p.confidence === "approximate" ? "Approximate — " : ""}${p.basis}`, ...(p.note ? [p.note] : [])],
    } satisfies PlatformPlacementSpec];
  }));

export function getPlatformPreset(platform: string, contentType?: string) {
  const id = platform.toLowerCase();
  return PLATFORM_PRESETS.find((item) => item.platform === id && (!contentType || item.contentType === contentType));
}

export function getPresetForImageOp(op: string) {
  const parsed = parsePlatformOp(op);
  return parsed ? getPlatformPreset(parsed.platform, parsed.placement) : undefined;
}
