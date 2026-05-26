import * as XLSX from "xlsx";

export function exportToExcel(sheets: Array<{ name: string; rows: Record<string, unknown>[] }>, filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, filename);
}
