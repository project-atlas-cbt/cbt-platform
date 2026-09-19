/** RFC4180 quoting plus spreadsheet formula neutralisation (B18 DoD 8). */
export function csvCell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) text = '';
  else if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  )
    text = String(value);
  else if (value instanceof Date) text = value.toISOString();
  // Export call sites supply scalar database values. Keeping a safe
  // structured fallback avoids Object.prototype's meaningless
  // "[object Object]" output if a future column is accidentally complex.
  else text = JSON.stringify(value) ?? '';
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
