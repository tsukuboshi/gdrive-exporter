import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

async function ensureParentDir(destPath: string): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
}

/** Pipes a stream to a file, removing the partial file if the stream fails. */
export async function streamToFile(
  stream: Readable,
  destPath: string,
): Promise<void> {
  await ensureParentDir(destPath);
  try {
    await pipeline(stream, createWriteStream(destPath));
  } catch (error) {
    await rm(destPath, { force: true });
    throw error;
  }
}

/** Writes text content to a file, creating parent directories as needed. */
export async function writeTextFile(
  destPath: string,
  content: string,
): Promise<void> {
  await ensureParentDir(destPath);
  await writeFile(destPath, content);
}
