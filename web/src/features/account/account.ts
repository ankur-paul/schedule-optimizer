/** The parts of a Supabase user the account menu shows. */
export interface AccountUser {
  email?: string;
  user_metadata?: { full_name?: unknown; name?: unknown; avatar_url?: unknown };
}

/** Google's full name, else the email. Email-link users have no name. */
export function displayName(user: AccountUser): string {
  const meta = user.user_metadata ?? {};
  for (const name of [meta.full_name, meta.name]) {
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return user.email ?? "Signed in";
}

/** Up to two letters for the avatar: "Ankur Paul" → "AP", "ankur@gndec.ac.in" → "A". */
export function initials(name: string): string {
  if (name.includes("@")) return name.charAt(0).toUpperCase();
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** Google's profile picture, if the user signed in with Google. */
export function avatarUrl(user: AccountUser): string | undefined {
  const url = user.user_metadata?.avatar_url;
  return typeof url === "string" && url ? url : undefined;
}

/**
 * Where Google and the email link send the user back: this app's own origin, so it works on any localhost port and,
 * later, on the deployed domain. The trailing slash matches Supabase allow-list entries like `http://localhost:*\/**`.
 */
export function redirectUrl(location: { origin: string }): string {
  return `${location.origin}/`;
}

/** Loose check so *Email me a sign-in link* is enabled only for something address-shaped; Supabase checks properly. */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** A sign-in failure in words a coordinator can act on. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case "otp_expired":
      return "That sign-in link has expired or was already used. Ask for a new one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many sign-in emails for now. Wait a while, or continue with Google.";
    case "email_address_invalid":
      return "That email address isn't valid.";
    case "access_denied":
      return "Sign-in was cancelled.";
  }
  if (error.status === 429) return "Too many sign-in emails for now. Wait a while, or continue with Google.";
  return error.message ? `Couldn't sign in: ${error.message}` : "Couldn't sign in. Try again.";
}

const ERROR_PARAMS = ["error", "error_code", "error_description"];

/**
 * `href` without the error Supabase appends to a failed sign-in redirect (in the hash, or the query for PKCE), so a
 * reload doesn't show it again. Any other part of the URL stays.
 */
export function withoutAuthError(href: string): string {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (ERROR_PARAMS.some((p) => hash.has(p))) url.hash = "";
  for (const p of ERROR_PARAMS) url.searchParams.delete(p);
  return url.toString();
}
