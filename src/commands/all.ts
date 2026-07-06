import { Command } from "commander";
import type { ExportTask } from "../utils/downloader.js";
import { logWarning } from "../utils/log.js";
import {
  planBinaryTask,
  planDocumentTasks,
  planPresentationTask,
  planSpreadsheetTasks,
} from "../utils/planner.js";
import { GOOGLE_APPS_PREFIX, GOOGLE_MIME } from "../utils/types.js";
import {
  type CommonExportOptions,
  planConcurrently,
  runExport,
  withAllSheetsOption,
  withAllTabsOption,
  withCommonExportOptions,
} from "./shared.js";

interface AllOptions extends CommonExportOptions {
  allSheets: boolean;
  allTabs: boolean;
}

export function allCommand(): Command {
  const command = new Command("all").description(
    "Export all files (Docs to MD, Sheets to CSV, Slides to PDF, others as-is)",
  );
  return withAllTabsOption(
    withAllSheetsOption(withCommonExportOptions(command)),
  ).action(async (folder: string, options: AllOptions) => {
    await runExport(folder, options, (ctx, files) =>
      planConcurrently(
        files,
        options.concurrency,
        async (file): Promise<ExportTask[]> => {
          switch (file.mimeType) {
            case GOOGLE_MIME.document:
              return planDocumentTasks(ctx, file, options.allTabs);
            case GOOGLE_MIME.spreadsheet:
              return planSpreadsheetTasks(ctx, file, options.allSheets);
            case GOOGLE_MIME.presentation:
              return [planPresentationTask(ctx, file)];
            default:
              if (file.mimeType.startsWith(GOOGLE_APPS_PREFIX)) {
                // Shortcuts, Drawings, Forms, etc. have no sensible export here.
                logWarning(
                  `Skipping unsupported Google file type (${file.mimeType}): ${file.name}`,
                );
                return [];
              }
              return [planBinaryTask(ctx, file)];
          }
        },
      ),
    );
  });
}
