"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

import {
  removeTournamentBanner,
  uploadTournamentBanner,
} from "@/app/admin/tournaments/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { AVATAR_ACCEPT, AVATAR_MAX_SOURCE_BYTES } from "@/lib/avatars";

/** Banners are wide, not square, so this downscales to a canvas instead of
    using the avatar cropper. 1280px covers any hero at 1x while keeping the
    stored WebP well under the R2 size ceiling. */
const MAX_WIDTH = 1280;

async function downscale(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.8),
  );
  if (!blob) throw new Error("encode failed");
  return new File([blob], "banner.webp", { type: "image/webp" });
}

/**
 * The hero banner row on the admin tournament page. Picks a wide image,
 * downscales it in the browser, and uploads it to the "tournament" avatar scope
 * (lib/avatars.ts) — the server re-checks the bytes regardless.
 */
export function BannerUploadRow({
  tournamentId,
  currentUrl,
}: {
  tournamentId: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > AVATAR_MAX_SOURCE_BYTES) {
      setError("That image is too large. Pick one under 10 MB.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const small = await downscale(file);
      const form = new FormData();
      form.set("file", small);
      const result = await uploadTournamentBanner(tournamentId, form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't process that image. Try a PNG, JPEG, or WebP.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await removeTournamentBanner(tournamentId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <BubbleRow
        label="Banner"
        value={currentUrl ? "Uploaded" : "Not set"}
        note={
          currentUrl
            ? undefined
            : "A wide image shown behind the name. PNG, JPEG, or WebP."
        }
        media={
          currentUrl ? (
            <span
              className="ff-banner-thumb"
              style={{ backgroundImage: `url(${currentUrl})` }}
              aria-hidden="true"
            />
          ) : undefined
        }
        action={
          <div className="ff-row__buttons">
            <button
              className="ff-btn ff-btn--soft ff-btn--sm"
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Uploading…" : currentUrl ? "Change" : "Upload"}
            </button>
            {currentUrl ? (
              <button
                className="ff-btn ff-btn--soft ff-btn--sm"
                type="button"
                disabled={busy}
                onClick={remove}
              >
                Remove
              </button>
            ) : null}
          </div>
        }
      >
        {error ? (
          <div className="ff-auth__error" role="alert">
            <p>{error}</p>
          </div>
        ) : undefined}
      </BubbleRow>

      <input
        ref={inputRef}
        className="screen-reader-text"
        type="file"
        accept={AVATAR_ACCEPT}
        aria-label="Choose banner image"
        onChange={onPick}
      />
    </>
  );
}
