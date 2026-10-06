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
  // P2-11: a Prisma Decimal (percentages) is written as its plain number;
  // JSON.stringify below would quote it, and spreadsheets read it as text.
  else if (isDecimalLike(value)) text = value.toFixed();
  // Export call sites supply scalar database values. Keeping a safe
  // structured fallback avoids Object.prototype's meaningless
  // "[object Object]" output if a future column is accidentally complex.
  else text = JSON.stringify(value) ?? '';
  // P3-3: a leading tab or carriage return also starts a formula in some
  // spreadsheet programs.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function isDecimalLike(value: unknown): value is { toFixed(): string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toFixed?: unknown }).toFixed === 'function' &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  );
}
