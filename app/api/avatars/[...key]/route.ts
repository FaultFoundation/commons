import { getAvatar, isValidKey } from "@/lib/avatars";

// Reads a per-request R2 binding.
export const dynamic = "force-dynamic";

/** A year. Safe because keys are content-addressed (lib/avatars.ts) — the bytes
    behind a given URL can never change, so a new picture is a new URL. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Just the two methods we use. Declared locally rather than leaning on an
    ambient CacheStorage: the DOM and workerd definitions disagree about
    `caches.default`, and this route only ever needs match/put. */
type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

/** workerd exposes `caches.default`; the Node runtime `next dev` uses does not,
    so this returns null there and the route falls back to a direct R2 read. */
function edgeCache(): EdgeCache | null {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return store?.default ?? null;
}

/**
 * Serves profile pictures and team logos out of the private AVATARS bucket.
 *
 * GET only, and deliberately not a directory: the key is pattern-checked before
 * R2 is touched, so there is no traversal and no listing. Two headers matter
 * beyond the obvious — `nosniff` stops a browser second-guessing the stored
 * content type, and the `default-src 'none'` CSP neuters anything that somehow
 * gets rendered as a document. Uploads are already restricted to three raster
 * signatures (see sniffImageType); this is the second layer.
 *
 * The Cache API sits in front of R2 so a repeat hit costs zero Class B
 * operations. It only exists in workerd — under `next dev` this degrades to a
 * direct read, which is why `npm run preview` is the run that actually
 * exercises the cache path.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const key = (await params).key.join("/");
  if (!isValidKey(key)) return new Response("Not found", { status: 404 });

  const cache = edgeCache();
  const hit = await cache?.match(request);
  if (hit) return hit;

  const object = await getAvatar(key);
  if (!object) return new Response("Not found", { status: 404 });

  const response = new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": CACHE_CONTROL,
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
    },
  });

  // Body is consumed twice, so hand the cache its own clone.
  await cache?.put(request, response.clone());
  return response;
}
