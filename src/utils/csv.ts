function escapeField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Converts a 2D array of cell values (as returned by the Sheets API) into a
 * CSV string. Rows shorter than the widest row are padded with empty fields.
 */
export function toCsv(rows: string[][]): string {
  let columnCount = 0;
  for (const row of rows) {
    columnCount = Math.max(columnCount, row.length);
  }

  let csv = "";
  for (const row of rows) {
    const padded =
      row.length < columnCount
        ? [...row, ...Array(columnCount - row.length).fill("")]
        : row;
    csv += `${padded.map(escapeField).join(",")}\n`;
  }
  return csv;
}
