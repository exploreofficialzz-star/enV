import { useState } from "react";

type CommentAuthorAvatarProps = {
  label: string;
  identityMode: "public" | "anonymous";
  imageUrl: string | null;
  size?: "normal" | "small";
};

function safeAvatarSource(value: string | null): string | null {
  if (!value) return null;
  if (/^\/api\/community\/avatar\?commentId=[0-9a-f-]{36}$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function CommentAuthorAvatar({
  label,
  identityMode,
  imageUrl,
  size = "normal",
}: CommentAuthorAvatarProps) {
  const source = identityMode === "public" ? safeAvatarSource(imageUrl) : null;
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = Boolean(source && failedSource !== source);
  const sizeClass = size === "small" ? "size-7 text-[10px]" : "size-9 text-xs";
  const initial = identityMode === "anonymous"
    ? "A"
    : label.trim().charAt(0).toUpperCase() || "E";

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-2 font-semibold text-muted ${sizeClass}`}
      aria-hidden="true"
    >
      {showImage ? (
        <>
          {loadedSource !== source ? <span className="env-shimmer absolute inset-0" /> : null}
          <img
            src={source ?? ""}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoadedSource(source)}
            onError={() => setFailedSource(source)}
            className={`relative size-full object-cover transition-opacity duration-200 ${loadedSource === source ? "opacity-100" : "opacity-0"}`}
          />
        </>
      ) : initial}
    </span>
  );
}
