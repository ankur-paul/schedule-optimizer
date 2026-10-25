// The commit a build was made from, served as /version.txt (T50) so the deploy can wait until Pages serves it.
// No imports: vite-plugin-version.ts uses this in Node too.

/** Pages sets CF_PAGES_COMMIT_SHA; elsewhere `git` (HEAD), else "unknown". Trimmed, so a newline never sticks. */
export function buildCommit(env: Record<string, string | undefined>, git: () => string | undefined): string {
  const fromPages = env.CF_PAGES_COMMIT_SHA?.trim();
  if (fromPages) return fromPages;
  try {
    return git()?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}
