/**
 * Extracts a Google Drive folder ID from a raw ID or a folder URL.
 * Supported URL forms:
 *   https://drive.google.com/drive/folders/<id>
 *   https://drive.google.com/drive/u/0/folders/<id>?resourcekey=...
 */
export function parseFolderId(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("Folder ID or URL must not be empty");
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const match = trimmed.match(/\/folders\/([\w-]+)/);
    if (!match) {
      throw new Error(`Could not extract a folder ID from URL: ${trimmed}`);
    }
    return match[1];
  }

  if (!/^[\w-]+$/.test(trimmed)) {
    throw new Error(`Invalid folder ID: ${trimmed}`);
  }
  return trimmed;
}

const MAX_FILE_NAME_LENGTH = 200;

/**
 * Sanitizes a single path segment (file or folder name) so it is safe on
 * Windows/macOS/Linux. Never pass a full path — directory separators are
 * treated as invalid characters.
 */
export function sanitizeFileName(name: string): string {
  const sanitized = name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, MAX_FILE_NAME_LENGTH);

  return sanitized === "" ? "_unnamed" : sanitized;
}

/** Normalizes an unknown thrown value into a human-readable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
