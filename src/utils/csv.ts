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
