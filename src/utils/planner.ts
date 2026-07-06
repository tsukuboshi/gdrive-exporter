import { extname, join } from "node:path";
import type { Auth } from "googleapis";
import { errorMessage, sanitizeFileName } from "./common.js";
import { exportTabAsMarkdown, listTabs } from "./docs-api.js";
import type { ExportTask } from "./downloader.js";
import { downloadToFile, exportToFile } from "./drive-api.js";
import { writeTextFile } from "./fs.js";
import { logWarning } from "./log.js";
import { getSheetAsCsv, listSheets } from "./sheets-api.js";
import { type DriveFile, EXPORT_MIME } from "./types.js";

/**
 * Reserves a not-yet-used local path, appending _1, _2, ... when a file with
 * the same name already exists in the same Drive folder.
 */
export function uniqueLocalPath(
  used: Set<string>,
  dir: string,
  baseName: string,
  ext: string,
): string {
  let candidate = join(dir, `${baseName}${ext}`);
  for (let i = 1; used.has(candidate); i++) {
    candidate = join(dir, `${baseName}_${i}${ext}`);
  }
  used.add(candidate);
  return candidate;
}

export interface PlannerContext {
  auth: Auth.OAuth2Client;
  outputDir: string;
  /** Tracks reserved local paths across all tasks of one command run. */
  usedPaths: Set<string>;
}

function sanitizedSegments(file: DriveFile): string[] {
  return file.pathSegments.map(sanitizeFileName);
}

function fileDir(ctx: PlannerContext, file: DriveFile): string {
  return join(ctx.outputDir, ...sanitizedSegments(file));
}

function fileLabel(file: DriveFile, localName: string): string {
  return join(...sanitizedSegments(file), localName);
}

/** Builds the common "one Drive file → one exported file" task shape. */
function simpleExportTask(
  ctx: PlannerContext,
  file: DriveFile,
  ext: string,
  execute: (localPath: string) => Promise<void>,
  baseName = sanitizeFileName(file.name),
): ExportTask {
  const localPath = uniqueLocalPath(
    ctx.usedPaths,
    fileDir(ctx, file),
    baseName,
    ext,
  );
  return {
    label: fileLabel(file, `${baseName}${ext}`),
    localPath,
    execute: () => execute(localPath),
  };
}

/**
 * Exports one document tab as Markdown, falling back to a whole-document
 * files.export when the undocumented tab endpoint fails.
 */
async function exportTabWithFallback(
  ctx: PlannerContext,
  file: DriveFile,
  tabId: string,
  localPath: string,
): Promise<void> {
  try {
    const markdown = await exportTabAsMarkdown(ctx.auth, file.id, tabId);
    await writeTextFile(localPath, markdown);
  } catch (error) {
    logWarning(
      `Tab export failed for "${file.name}" (${errorMessage(error)}). ` +
        "Falling back to whole-document export (all tabs concatenated).",
    );
    await exportToFile(ctx.auth, file.id, EXPORT_MIME.markdown, localPath);
  }
}

/**
 * Plans Markdown export task(s) for a Google Doc. Default exports only the
 * first tab; allTabs exports each tab as filename_tabname.md. Falls back to a
 * whole-document files.export when tab listing or per-tab export fails
 * (the tab export endpoint is undocumented).
 */
export async function planDocumentTasks(
  ctx: PlannerContext,
  file: DriveFile,
  allTabs: boolean,
): Promise<ExportTask[]> {
  let tabs: Awaited<ReturnType<typeof listTabs>> = [];
  try {
    tabs = await listTabs(ctx.auth, file.id);
  } catch (error) {
    logWarning(
      `Could not list tabs for "${file.name}" (is the Google Docs API enabled?): ` +
        `${errorMessage(error)}. Exporting the whole document instead.`,
    );
  }

  if (tabs.length <= 1) {
    return [
      simpleExportTask(ctx, file, ".md", (localPath) =>
        exportToFile(ctx.auth, file.id, EXPORT_MIME.markdown, localPath),
      ),
    ];
  }

  const exportedTabs = allTabs ? tabs : [tabs[0]];
  return exportedTabs.map((tab) =>
    simpleExportTask(
      ctx,
      file,
      ".md",
      (localPath) => exportTabWithFallback(ctx, file, tab.tabId, localPath),
      allTabs
        ? `${sanitizeFileName(file.name)}_${sanitizeFileName(tab.title)}`
        : sanitizeFileName(file.name),
    ),
  );
}

/**
 * Plans CSV export task(s) for a Google Sheet. Default exports only the first
 * sheet via files.export; allSheets exports each sheet as
 * filename_sheetname.csv via the Sheets API.
 */
export async function planSpreadsheetTasks(
  ctx: PlannerContext,
  file: DriveFile,
  allSheets: boolean,
): Promise<ExportTask[]> {
  if (!allSheets) {
    return [
      simpleExportTask(ctx, file, ".csv", (localPath) =>
        exportToFile(ctx.auth, file.id, EXPORT_MIME.csv, localPath),
      ),
    ];
  }

  const sheetTitles = await listSheets(ctx.auth, file.id);
  return sheetTitles.map((title) =>
    simpleExportTask(
      ctx,
      file,
      ".csv",
      async (localPath) => {
        const csv = await getSheetAsCsv(ctx.auth, file.id, title);
        await writeTextFile(localPath, csv);
      },
      `${sanitizeFileName(file.name)}_${sanitizeFileName(title)}`,
    ),
  );
}

/** Plans a PDF export task for a Google Slides presentation. */
export function planPresentationTask(
  ctx: PlannerContext,
  file: DriveFile,
): ExportTask {
  return simpleExportTask(ctx, file, ".pdf", (localPath) =>
    exportToFile(ctx.auth, file.id, EXPORT_MIME.pdf, localPath),
  );
}

/** Plans a binary download task for a non-Google file (keeps its extension). */
export function planBinaryTask(
  ctx: PlannerContext,
  file: DriveFile,
): ExportTask {
  const rawExt = extname(file.name);
  const base = sanitizeFileName(
    rawExt === "" ? file.name : file.name.slice(0, -rawExt.length),
  );
  // The extension skips sanitizeFileName (it would strip the leading dot),
  // so apply the same character rules to it here.
  const cleanedExt = rawExt === "" ? "" : sanitizeFileName(rawExt.slice(1));
  const ext =
    cleanedExt === "" || cleanedExt === "_unnamed"
      ? ""
      : `.${cleanedExt}`.slice(0, 20);
  return simpleExportTask(
    ctx,
    file,
    ext,
    (localPath) => downloadToFile(ctx.auth, file.id, localPath),
    base,
  );
}
