import type { Readable } from "node:stream";
import { type Auth, type drive_v3, google } from "googleapis";
import pLimit from "p-limit";
import { streamToFile } from "./fs.js";
import { withRetry } from "./retry.js";
import { type DriveFile, GOOGLE_MIME } from "./types.js";

const driveClients = new WeakMap<Auth.OAuth2Client, drive_v3.Drive>();

function driveFor(auth: Auth.OAuth2Client): drive_v3.Drive {
  let drive = driveClients.get(auth);
  if (!drive) {
    drive = google.drive({ version: "v3", auth });
    driveClients.set(auth, drive);
  }
  return drive;
}

/**
 * Recursively lists all non-folder files under a folder, annotating each file
 * with its raw path segments. Sibling folders are listed concurrently
 * (bounded by `concurrency`), so the order of returned files is not
 * deterministic across folders.
 */
export async function listFilesInFolder(
  auth: Auth.OAuth2Client,
  folderId: string,
  concurrency = 5,
): Promise<DriveFile[]> {
  const drive = driveFor(auth);
  const limit = pLimit(concurrency);
  const files: DriveFile[] = [];
  let frontier: Array<{ id: string; pathSegments: string[] }> = [
    { id: folderId, pathSegments: [] },
  ];

  while (frontier.length > 0) {
    const discovered = await Promise.all(
      frontier.map((folder) =>
        limit(async () => {
          const subfolders: Array<{ id: string; pathSegments: string[] }> = [];
          let pageToken: string | undefined;
          do {
            const res = await withRetry(() =>
              drive.files.list({
                q: `'${folder.id}' in parents and trashed = false`,
                fields: "nextPageToken, files(id, name, mimeType)",
                pageSize: 1000,
                pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
              }),
            );
            for (const file of res.data.files ?? []) {
              if (!file.id) continue;
              if (file.mimeType === GOOGLE_MIME.folder) {
                subfolders.push({
                  id: file.id,
                  pathSegments: [...folder.pathSegments, file.name ?? ""],
                });
              } else {
                files.push({
                  id: file.id,
                  name: file.name ?? "",
                  mimeType: file.mimeType ?? "",
                  pathSegments: folder.pathSegments,
                });
              }
            }
            pageToken = res.data.nextPageToken ?? undefined;
          } while (pageToken);
          return subfolders;
        }),
      ),
    );
    frontier = discovered.flat();
  }

  return files;
}

/** Exports a Google Workspace file to destPath (10MB API limit applies). */
export async function exportToFile(
  auth: Auth.OAuth2Client,
  fileId: string,
  mimeType: string,
  destPath: string,
): Promise<void> {
  const drive = driveFor(auth);
  const res = await withRetry(() =>
    drive.files.export({ fileId, mimeType }, { responseType: "stream" }),
  );
  await streamToFile(res.data as Readable, destPath);
}

/** Downloads a non-Google (binary) file to destPath. */
export async function downloadToFile(
  auth: Auth.OAuth2Client,
  fileId: string,
  destPath: string,
): Promise<void> {
  const drive = driveFor(auth);
  const res = await withRetry(() =>
    drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" },
    ),
  );
  await streamToFile(res.data as Readable, destPath);
}
