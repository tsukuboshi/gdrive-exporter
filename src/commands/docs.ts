import { Command } from "commander";
import { planDocumentTasks } from "../utils/planner.js";
import { GOOGLE_MIME } from "../utils/types.js";
import {
  type CommonExportOptions,
  planConcurrently,
  runExport,
  withAllTabsOption,
  withCommonExportOptions,
} from "./shared.js";

interface DocsOptions extends CommonExportOptions {
  allTabs: boolean;
}

export function docsCommand(): Command {
  const command = new Command("docs").description(
    "Export Google Docs as Markdown (.md)",
  );
  return withAllTabsOption(withCommonExportOptions(command)).action(
    async (folder: string, options: DocsOptions) => {
      await runExport(folder, options, (ctx, files) =>
        planConcurrently(
          files.filter((f) => f.mimeType === GOOGLE_MIME.document),
          options.concurrency,
          (file) => planDocumentTasks(ctx, file, options.allTabs),
        ),
      );
    },
  );
}
