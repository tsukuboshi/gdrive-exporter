import { type Auth, google, type sheets_v4 } from "googleapis";
import { toCsv } from "./csv.js";
import { withRetry } from "./retry.js";

const sheetsClients = new WeakMap<Auth.OAuth2Client, sheets_v4.Sheets>();

function sheetsFor(auth: Auth.OAuth2Client): sheets_v4.Sheets {
  let sheets = sheetsClients.get(auth);
  if (!sheets) {
    sheets = google.sheets({ version: "v4", auth });
    sheetsClients.set(auth, sheets);
  }
  return sheets;
}

/** Lists the titles of all sheet tabs of a spreadsheet. */
export async function listSheets(
  auth: Auth.OAuth2Client,
  spreadsheetId: string,
): Promise<string[]> {
  const sheets = sheetsFor(auth);
  const res = await withRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(title)",
    }),
  );
  return (res.data.sheets ?? []).flatMap((sheet) =>
    sheet.properties?.title != null ? [sheet.properties.title] : [],
  );
}

/**
 * Fetches one sheet's values and converts them to CSV. Needed because
 * drive.files.export with text/csv only exports the first sheet.
 */
export async function getSheetAsCsv(
  auth: Auth.OAuth2Client,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<string> {
  const sheets = sheetsFor(auth);
  // Sheet titles used as an A1 range must be single-quoted, with internal
  // single quotes doubled (e.g. 'Bob''s sheet').
  const range = `'${sheetTitle.replace(/'/g, "''")}'`;
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "FORMATTED_VALUE",
    }),
  );
  const values = (res.data.values ?? []) as unknown[][];
  return toCsv(values.map((row) => row.map((cell) => String(cell ?? ""))));
}
