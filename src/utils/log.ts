import type { ExportSummary } from "./downloader.js";

/**
 * Strips control characters (including ANSI escape starters) so externally
 * sourced strings (Drive file names, OAuth error params) cannot spoof
 * terminal output.
 */
export function stripControlChars(text: string): string {
  return text.replace(/\p{Cc}/gu, "");
}

export function logWarning(message: string): void {
  console.warn(`[WARNING] ${stripControlChars(message)}`);
}

export function printSummary(summary: ExportSummary): void {
  console.log(
    `\nExport complete: ${summary.succeeded} succeeded, ${summary.skipped} skipped, ` +
      `${summary.failed} failed (total ${summary.total})`,
  );
  if (summary.failures.length > 0) {
    console.log("\nFailed files:");
    for (const failure of summary.failures) {
      console.log(stripControlChars(`  - ${failure.label}: ${failure.error}`));
    }
  }
}
