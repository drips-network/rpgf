export function escapeCsvValue(value: string): string {
  return value.replaceAll(/"/g, '""');
}
