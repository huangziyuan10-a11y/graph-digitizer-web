/**
 * Export utilities for CSV and Excel
 */

function exportCSV(data) {
  let csv = 'X,Y\n';
  for (const pt of data) {
    csv += `${pt.x},${pt.y}\n`;
  }
  downloadFile(csv, 'graph_data.csv', 'text/csv');
}

function exportExcel(data) {
  // Create a simple XLSX file using the minimal XML spreadsheet format
  // This produces a real .xlsx-compatible XML file that Excel can open
  const xmlHeader = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n';
  const workbookStart = '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="Graph Data"><Table>\n';
  const workbookEnd = '</Table></Worksheet></Workbook>';

  let rows = '<Row><Cell><Data ss:Type="String">X</Data></Cell><Cell><Data ss:Type="String">Y</Data></Cell></Row>\n';
  for (const pt of data) {
    rows += `<Row><Cell><Data ss:Type="Number">${pt.x}</Data></Cell><Cell><Data ss:Type="Number">${pt.y}</Data></Cell></Row>\n`;
  }

  const xml = xmlHeader + workbookStart + rows + workbookEnd;
  downloadFile(xml, 'graph_data.xls', 'application/vnd.ms-excel');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
