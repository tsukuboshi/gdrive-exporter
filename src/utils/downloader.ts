import { access } from "node:fs/promises";
import pLimit from "p-limit";
import { errorMessage } from "./common.js";
import { logWarning } from "./log.js";

export interface ExportTask {
  /** Display name used in progress logs and failure summaries. */
  label: string;
  localPath: string;
  /** Performs the actual export and writes the file to localPath. */
  execute: () => Promise<void>;
}

export interface ExportSummary {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  failures: Array<{ label: string; error: string }>;
}

export interface DownloaderLogger {
  progress: (current: number, total: number, label: string) => void;
  skip: (current: number, total: number, label: string) => void;
  warn: (message: string) => void;
}

export interface ExecuteOptions {
  force: boolean;
  concurrency: number;
  fileExists?: (path: string) => Promise<boolean>;
  logger?: DownloaderLogger;
}

async function defaultFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const defaultLogger: DownloaderLogger = {
  progress: (current, total, label) =>
    console.log(`[${current}/${total}] Downloading: ${label}`),
  skip: (current, total, label) =>
    console.log(`[${current}/${total}] Skipping (exists): ${label}`),
  warn: logWarning,
};

export async function executeExportTasks(
  tasks: ExportTask[],
  options: ExecuteOptions,
): Promise<ExportSummary> {
  const fileExists = options.fileExists ?? defaultFileExists;
  const logger = options.logger ?? defaultLogger;
  const limit = pLimit(options.concurrency);

  const summary: ExportSummary = {
    total: tasks.length,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };
  let processed = 0;

  await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        const current = ++processed;
        if (!options.force && (await fileExists(task.localPath))) {
          summary.skipped++;
          logger.skip(current, summary.total, task.label);
          return;
        }
        logger.progress(current, summary.total, task.label);
        try {
          await task.execute();
          summary.succeeded++;
        } catch (error) {
          summary.failed++;
          const message = errorMessage(error);
          summary.failures.push({ label: task.label, error: message });
          logger.warn(`Failed to export: ${task.label} - ${message}`);
        }
      }),
    ),
  );

  return summary;
}
