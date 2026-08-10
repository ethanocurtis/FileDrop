const MAX_FILENAME_LENGTH = 200;
const UNSAFE_CHARS = /["*/:<>?\\|]/g;

/** Remove ASCII control characters (0-31 and DEL), which are unsafe in
 * file names, storage keys, and HTTP headers alike. Written as a manual
 * code-point filter rather than a regex control-char class to keep the
 * source free of easily-mangled escape sequences. */
function stripControlChars(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) continue;
    out += ch;
  }
  return out;
}

/**
 * Sanitize a browser-supplied file name before it ever touches the file
 * system, a database row, or a Content-Disposition header.
 *
 * - Strips directory components (blocks path traversal, e.g. "../../etc/passwd")
 * - Removes control characters and characters that are unsafe in headers/paths
 * - Collapses whitespace and trims leading dots (hidden-file / traversal tricks)
 * - Truncates to a sane max length while preserving the extension
 */
export function sanitizeFileName(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() ?? "file";

  let cleaned = stripControlChars(base)
    .replace(UNSAFE_CHARS, "_")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ");

  if (cleaned.length === 0) cleaned = "file";

  if (cleaned.length > MAX_FILENAME_LENGTH) {
    const dotIndex = cleaned.lastIndexOf(".");
    const ext = dotIndex > 0 ? cleaned.slice(dotIndex) : "";
    const stem = dotIndex > 0 ? cleaned.slice(0, dotIndex) : cleaned;
    cleaned = stem.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }

  return cleaned;
}
