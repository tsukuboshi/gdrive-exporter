export const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";

export const GOOGLE_MIME = {
  folder: `${GOOGLE_APPS_PREFIX}folder`,
  document: `${GOOGLE_APPS_PREFIX}document`,
  spreadsheet: `${GOOGLE_APPS_PREFIX}spreadsheet`,
  presentation: `${GOOGLE_APPS_PREFIX}presentation`,
} as const;

export const EXPORT_MIME = {
  markdown: "text/markdown",
  csv: "text/csv",
  pdf: "application/pdf",
} as const;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Raw (unsanitized) Drive folder names from the export root down to this file. */
  pathSegments: string[];
}
