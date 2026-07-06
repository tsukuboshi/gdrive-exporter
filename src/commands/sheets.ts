import { Command } from "commander";
import { planSpreadsheetTasks } from "../utils/planner.js";
import { GOOGLE_MIME } from "../utils/types.js";
import {
  type CommonExportOptions,
  planConcurrently,
  runExport,
  withAllSheetsOption,
  withCommonExportOptions,
} from "./shared.js";

interface SheetsOptions extends CommonExportOptions {
  allSheets: boolean;
}

export function sheetsCommand(): Command {
  const command = new Command("sheets").description(
    "Export Google Sheets as CSV (.csv)",
  );
  return withAllSheetsOption(withCommonExportOptions(command)).action(
    async (folder: string, options: SheetsOptions) => {
      await runExport(folder, options, (ctx, files) =>
        planConcurrently(
          files.filter((f) => f.mimeType === GOOGLE_MIME.spreadsheet),
          options.concurrency,
          (file) => planSpreadsheetTasks(ctx, file, options.allSheets),
        ),
      );
    },
  );
}
