import { getCloudflareContext } from "@opennextjs/cloudflare";

// ---------------------------------------------------------------------------
// Profile pictures and team logos, stored in the AVATARS R2 bucket.
//
// Keys are content-addressed — the hash IS the bytes — which is what makes the
// serving route safe to mark `immutable`: a given URL can never point at
// different pixels, so a replaced picture is a new URL rather than a cache
// invalidation problem.
//
// The stored value is the /api/avatars/... PATH, never an absolute URL, so the
// eventual workers.dev -> commons.fault.foundation cutover needs no data
// migration.
// ---------------------------------------------------------------------------

/** The square the cropper exports; also the size every surface renders at 1x. */
export const AVATAR_PX = 256;

/** Abuse ceiling, not a target: a 256px WebP crop lands around 20 KB. */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** What the file picker offers, and what putAvatar will actually accept. */
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

/** Rejects a huge camera original before the browser tries to decode it. */
export const AVATAR_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export type AvatarScope = "user" | "team";

export type PutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** The one shape the serving route will resolve; anything else 404s. */
const KEY_PATTERN = /^(user|team)\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{16}\.webp$/;

const URL_PREFIX = "/api/avatars/";

/**
 * Identify the format from the bytes themselves.
 *
 * SECURITY — the most important function in this file. Never trust the
 * filename or the browser-supplied MIME type: both are attacker-controlled,
 * and these images are served from our own origin, so a file that the browser
 * decides is an SVG (or HTML) would be *stored XSS* against the Commons.
 * Only these three raster signatures are allowed through, and the type we
 * return here is the one written to R2 and echoed back on read.
 */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  const startsWith = (...sig: number[]) =>
    sig.every((byte, i) => bytes[i] === byte);

  // PNG: \x89 P N G \r \n \x1a \n
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  // WebP: "RIFF" ???? "WEBP" — the size field in between is not fixed.
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** First 16 hex of the SHA-256 — 64 bits, far more than enough to separate one
    person's successive crops without making the URL unwieldy. */
async function contentHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest, 0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bucket(): R2Bucket {
  return getCloudflareContext().env.AVATARS;
}

/** True for a value this module produced — the guard before treating a stored
    string as one of our keys (an old Discord CDN URL must not be parsed). */
export function isManagedAvatar(url: string | null | undefined): url is string {
  if (!url?.startsWith(URL_PREFIX)) return false;
  return KEY_PATTERN.test(url.slice(URL_PREFIX.length));
}

/** The R2 key behind one of our URLs, or null for anything foreign. */
export function keyFromUrl(url: string | null | undefined): string | null {
  return isManagedAvatar(url) ? url.slice(URL_PREFIX.length) : null;
}

/** Validate the key the serving route was asked for. Rejects traversal, other
    extensions, and anything that isn't shaped like something we wrote. */
export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Store a cropped image and return the path to serve it from.
 *
 * The client crops to a canvas before uploading, but that is a convenience, not
 * a guarantee — everything here re-checks the raw bytes as if they arrived from
 * `curl`.
 */
export async function putAvatar(
  scope: AvatarScope,
  ownerId: string,
  bytes: ArrayBuffer,
): Promise<PutResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    return { ok: false, error: "That image is too large." };
  }

  const contentType = sniffImageType(new Uint8Array(bytes));
  if (!contentType) {
    return { ok: false, error: "Use a PNG, JPEG, or WebP image." };
  }

  // Keep the id inside the key charset the serving route will accept, so we can
  // never write an object that can't be read back.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ownerId)) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const key = `${scope}/${ownerId}/${await contentHash(bytes)}.webp`;
  await bucket().put(key, bytes, {
    // The sniffed type, never the client's claim. The .webp suffix is just a
    // stable key shape — the route serves whatever this says.
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
  });

  return { ok: true, url: `${URL_PREFIX}${key}` };
}

/**
 * Drop the object behind a stored URL. Silent on anything we didn't write
 * (a Discord CDN avatar, an empty column) and never throws — losing an orphan
 * object is not worth failing a user's save over.
 */
export async function deleteAvatarByUrl(
  url: string | null | undefined,
): Promise<void> {
  const key = keyFromUrl(url);
  if (!key) return;
  try {
    await bucket().delete(key);
  } catch {
    // Orphaned object; the bytes are tiny and the bucket is ours.
  }
}

/** Read an object for the serving route. */
export async function getAvatar(key: string): Promise<R2ObjectBody | null> {
  if (!isValidKey(key)) return null;
  return bucket().get(key);
}
