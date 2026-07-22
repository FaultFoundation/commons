"use client";

import { useRef, useState, type ChangeEvent } from "react";
import AvatarEditor, { type AvatarEditorRef } from "react-avatar-editor";

import { Avatar } from "@/components/dashboard/Avatar";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_SOURCE_BYTES,
  AVATAR_PX,
} from "@/lib/avatars";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Room around the crop square for the parts of the photo being trimmed. */
const EDITOR_BORDER = 32;

/**
 * Picture row + crop popup, shared by the Account tab and a team's settings.
 *
 * Cropping happens entirely in the browser: react-avatar-editor renders the
 * framed result to a canvas, so what leaves here is already a small square WebP
 * rather than someone's 8 MB camera original. The server re-checks the bytes
 * regardless (lib/avatars.ts) — this is for the member's benefit, not a
 * security boundary.
 *
 * The popup is the existing ConfirmDialog: native <dialog>, so Esc, focus
 * trapping and the busy state come for free.
 */
export function AvatarUploadRow({
  label,
  name,
  currentUrl,
  shape = "circle",
  onSave,
  onRemove,
}: {
  label: string;
  /** Drives the initials fallback and the crop dialog's title. */
  name: string;
  currentUrl: string | null;
  shape?: "circle" | "team";
  /** Resolves to an error message, or null on success. */
  onSave: (file: File) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
}) {
  const editorRef = useRef<AvatarEditorRef>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be picked again after a cancel — without this the
    // input's value is unchanged and onChange never fires a second time.
    event.target.value = "";
    if (!file) return;

    if (file.size > AVATAR_MAX_SOURCE_BYTES) {
      setRowError("That image is too large. Pick one under 10 MB.");
      return;
    }
    setRowError(null);
    setError(null);
    setZoom(1.2);
    setSource(file);
  }

  function close() {
    if (busy) return;
    setSource(null);
    setError(null);
  }

  async function save() {
    const editor = editorRef.current;
    if (!editor || busy) return;
    setBusy(true);
    setError(null);

    // getImageScaledToCanvas returns exactly the framed square — no manual
    // crop math, which is the whole reason this library is here.
    const blob = await new Promise<Blob | null>((resolve) => {
      editor.getImageScaledToCanvas().toBlob(resolve, "image/webp", 0.9);
    });

    if (!blob) {
      setBusy(false);
      setError(GENERIC_ERROR);
      return;
    }

    const failure = await onSave(
      new File([blob], "avatar.webp", { type: "image/webp" }),
    );
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setSource(null);
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setRowError(null);
    const failure = await onRemove();
    setBusy(false);
    if (failure) setRowError(failure);
  }

  return (
    <>
      <BubbleRow
        label={label}
        value={currentUrl ? "Uploaded" : "Not set"}
        note={
          currentUrl
            ? undefined
            : "PNG, JPEG, or WebP. You'll be able to crop it."
        }
        media={
          <Avatar src={currentUrl} name={name} shape={shape} size="lg" />
        }
        action={
          <div className="ff-row__buttons">
            <button
              className="ff-btn ff-btn--outline ff-btn--sm"
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {currentUrl ? "Change" : "Upload"}
            </button>
            {currentUrl ? (
              <button
                className="ff-btn ff-btn--outline ff-btn--sm"
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
        {rowError ? (
          <div className="ff-auth__error" role="alert">
            <p>{rowError}</p>
          </div>
        ) : undefined}
      </BubbleRow>

      <input
        ref={inputRef}
        className="screen-reader-text"
        type="file"
        accept={AVATAR_ACCEPT}
        aria-label={`Choose ${label.toLowerCase()}`}
        onChange={onPick}
      />

      <ConfirmDialog
        open={source !== null}
        title="Adjust Your Crop"
        description="Drag the image to reposition it, and zoom to fit."
        confirmLabel={busy ? "Saving…" : "Save"}
        busy={busy}
        error={error}
        onConfirm={save}
        onClose={close}
      >
        {source ? (
          <div className="ff-cropper">
            <AvatarEditor
              ref={editorRef}
              image={source}
              width={AVATAR_PX}
              height={AVATAR_PX}
              border={EDITOR_BORDER}
              borderRadius={shape === "circle" ? AVATAR_PX / 2 : 24}
              color={[0, 10, 25, 0.6]}
              scale={zoom}
            />
            <label className="ff-cropper__zoom">
              <span className="ff-auth__label">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                disabled={busy}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
