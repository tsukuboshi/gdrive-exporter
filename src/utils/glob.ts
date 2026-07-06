/**
 * Minimal glob matching for --include patterns. Supports:
 *   `*`  — any characters except `/`
 *   `**` — any characters including `/`
 *   `?`  — a single character except `/`
 * A pattern without `/` matches against the file name only (like
 * minimatch's matchBase), so `*.csv` matches files in any subfolder.
 */

const REGEX_SPECIALS = /[.+^${}()|[\]\\]/g;

function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        source += ".*";
        i++;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(REGEX_SPECIALS, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * Tests a `/`-separated relative path against one glob pattern.
 * Patterns without `/` are matched against the last path segment only.
 */
export function matchesGlob(relativePath: string, pattern: string): boolean {
  const target = pattern.includes("/")
    ? relativePath
    : (relativePath.split("/").at(-1) ?? relativePath);
  return globToRegExp(pattern).test(target);
}

/** Tests a `/`-separated relative path against any of the glob patterns. */
export function matchesAnyGlob(
  relativePath: string,
  patterns: string[],
): boolean {
  return patterns.some((pattern) => matchesGlob(relativePath, pattern));
}
