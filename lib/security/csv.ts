/** Prevent spreadsheet formula injection while preserving readable CSV data. */
export function escapeCsvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\t\r ]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function createCsv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
}
