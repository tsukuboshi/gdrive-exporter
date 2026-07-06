import { relative, sep } from "node:path";
import type { Command } from "commander";
import type { Auth } from "googleapis";
import pLimit from "p-limit";
import { loadAuthorizedClient } from "../utils/auth.js";
import { parseFolderId } from "../utils/common.js";
import { type ExportTask, executeExportTasks } from "../utils/downloader.js";
import { listFilesInFolder } from "../utils/drive-api.js";
import { matchesAnyGlob } from "../utils/glob.js";
import { printSummary } from "../utils/log.js";
import type { PlannerContext } from "../utils/planner.js";
import type { DriveFile } from "../utils/types.js";

export interface CommonExportOptions {
  output: string;
  force: boolean;
  concurrency: number;
  credentials?: string;
  include: string[];
}

export function parseConcurrency(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(`Invalid concurrency: ${value}`);
  }
  return parsed;
}

const DEFAULT_OUTPUT_DIR = "./gdrive-data";

/** Adds the folder argument and options shared by every export command. */
export function withCommonExportOptions(command: Command): Command {
  return command
    .argument("<folder>", "Google Drive folder URL or ID")
    .option("-o, --output <dir>", "output directory", DEFAULT_OUTPUT_DIR)
    .option("-f, --force", "overwrite existing files", false)
    .option(
      "-c, --concurrency <n>",
      "concurrent downloads",
      parseConcurrency,
      5,
    )
    .option(
      "--credentials <path>",
      "path to credentials.json (default: auto-discover)",
    )
    .option(
      "--include <pattern>",
      "export only files matching this glob (relative path, or file name if " +
        "the pattern has no '/'; repeatable)",
      (value: string, previous: string[]) => previous.concat(value),
      [] as string[],
    );
}

export function withAllTabsOption(command: Command): Command {
  return command.option(
    "--all-tabs",
    "export every document tab as a separate file",
    false,
  );
}

export function withAllSheetsOption(command: Command): Command {
  return command.option(
    "--all-sheets",
    "export every sheet tab as a separate CSV file",
    false,
  );
}

/**
 * Plans tasks for many files with bounded concurrency (planning may call the
 * Docs/Sheets APIs per file). Task order follows the input file order.
 */
export async function planConcurrently(
  files: DriveFile[],
  concurrency: number,
  planFile: (file: DriveFile) => Promise<ExportTask[]> | ExportTask[],
): Promise<ExportTask[]> {
  const limit = pLimit(concurrency);
  const nested = await Promise.all(
    files.map((file) => limit(() => planFile(file))),
  );
  return nested.flat();
}

/**
 * Shared flow for all export commands: resolve folder, authenticate, list
 * files, plan tasks, run them, print the summary.
 */
export async function runExport(
  folderInput: string,
  options: CommonExportOptions,
  planTasks: (ctx: PlannerContext, files: DriveFile[]) => Promise<ExportTask[]>,
): Promise<void> {
  const folderId = parseFolderId(folderInput);
  const auth: Auth.OAuth2Client = await loadAuthorizedClient(
    options.credentials,
  );

  console.log("Listing files in Google Drive folder...");
  const files = await listFilesInFolder(auth, folderId, options.concurrency);

  const ctx: PlannerContext = {
    auth,
    outputDir: options.output,
    usedPaths: new Set<string>(),
  };
  let tasks = await planTasks(ctx, files);
  if (tasks.length === 0) {
    console.log("No files found in folder.");
    return;
  }

  if (options.include.length > 0) {
    const total = tasks.length;
    tasks = tasks.filter((task) =>
      matchesAnyGlob(
        relative(options.output, task.localPath).split(sep).join("/"),
        options.include,
      ),
    );
    console.log(`--include matched ${tasks.length} of ${total} files.`);
    if (tasks.length === 0) {
      return;
    }
  }

  const summary = await executeExportTasks(tasks, {
    force: options.force,
    concurrency: options.concurrency,
  });
  printSummary(summary);

  if (summary.failed > 0 && summary.succeeded === 0) {
    process.exitCode = 1;
  }
}
