export function downloadCsv(name, columns, rows) {
  const quote = value => {
    const safe = typeof value === "string" && /^[\s]*[=+@\-\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${String(safe ?? "").replaceAll('"', '""')}"`;
  };
  const content = [columns, ...rows].map(row => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
