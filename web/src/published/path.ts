// The public link /<handle>/<id> (T30). No imports: vite-plugin-published.ts uses this in Node too.

/** The institute's part of the link, as T27's database checks it. */
const HANDLE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
/** The timetable's random `public_id`: 10 characters from a–z0–9. */
const PUBLIC_ID = /^[a-z0-9]{10}$/;

export interface PublishedPath {
  handle: string;
  publicId: string;
}

function segments(pathname: string): string[] {
  return pathname.split(/[?#]/)[0].split("/").filter(Boolean);
}

/** `/gndec/k7f3q9xa2m` → handle and id; stray slashes and capitals are forgiven. Anything else → null. */
export function parsePublishedPath(pathname: string): PublishedPath | null {
  const parts = segments(pathname).map((s) => s.toLowerCase());
  if (parts.length !== 2) return null;
  const [handle, publicId] = parts;
  return HANDLE.test(handle) && PUBLIC_ID.test(publicId) ? { handle, publicId } : null;
}

/** The link as it should read: lowercase, no stray slashes. */
export function publishedPath(handle: string, publicId: string): string {
  return `/${handle}/${publicId}`;
}

/** First segments that are the dev server's or the build's own, never a handle. `help` is /help/<page>. */
const NOT_HANDLES = new Set(["assets", "src", "node_modules", "public", "help"]);

/**
 * Whether the dev or preview server should answer `url` with published.html: two plain segments (no dots, so not a
 * file; no `@`, so not Vite's own `/@vite/…`), the first not one of the server's folders. Looser than
 * `parsePublishedPath`, so a mistyped id still gets the page and its "isn't published" message.
 */
export function isPublishedRewrite(url: string): boolean {
  const parts = segments(url);
  return parts.length === 2 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)) && !NOT_HANDLES.has(parts[0].toLowerCase());
}
