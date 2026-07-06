import { Command } from "commander";
import { planPresentationTask } from "../utils/planner.js";
import { GOOGLE_MIME } from "../utils/types.js";
import {
  type CommonExportOptions,
  runExport,
  withCommonExportOptions,
} from "./shared.js";

export function slidesCommand(): Command {
  const command = new Command("slides").description(
    "Export Google Slides as PDF (.pdf)",
  );
  return withCommonExportOptions(command).action(
    async (folder: string, options: CommonExportOptions) => {
      await runExport(folder, options, async (ctx, files) =>
        files
          .filter((f) => f.mimeType === GOOGLE_MIME.presentation)
          .map((file) => planPresentationTask(ctx, file)),
      );
    },
  );
}
