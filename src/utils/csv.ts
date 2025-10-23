// @deno-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import XLSX from 'xlsx';

export function escapeCsvValue(value: unknown): string {
  const stringValue = String(value ?? "");

  // Check for characters that require quoting
  const needsQuotes = /[,\\"\n]/.test(stringValue) ||
    /^[=\-+]/.test(stringValue);

  if (!needsQuotes) {
    return stringValue;
  }

  // Escape double quotes by doubling them
  const escapedValue = stringValue.replaceAll(/"/g, '""');

  // Enclose the entire value in double quotes
  return `"${escapedValue}"`;
}

export function convertToXlsxBuffer(csv: string): Uint8Array {
  const wb = XLSX.read(csv, { type: 'string' });
  const buff = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  return buff;
}
