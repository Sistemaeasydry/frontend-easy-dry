import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RegistroAuditoriaApi } from '../../core/services/auditoria.service';

const ENCABEZADOS = ['Fecha', 'Quién', 'Rol', 'Pantalla', 'Qué pasó', 'Antes', 'Después'] as const;

/** Un valor del antes o el después como texto corto: `campo: valor` por línea. */
export function textoDeValor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v !== 'object') return String(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}: ${x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x ?? '')}`)
    .join('\n');
}

const fechaHora = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'medium' });
};

/** Las filas del exportable como texto, en el orden de los encabezados. */
export function filasParaExportar(filas: readonly RegistroAuditoriaApi[]): string[][] {
  return filas.map((f) => [fechaHora(f.fecha), f.actor, f.rol, f.moduloNombre, f.resumen, textoDeValor(f.antes), textoDeValor(f.despues)]);
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nombreArchivo = (ext: string) => `auditoria_${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function exportarAuditoriaExcel(filas: readonly RegistroAuditoriaApi[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Auditoría');
  hoja.views = [{ showGridLines: false }];
  hoja.addRow(['Auditoría del sistema']).font = { bold: true, size: 14 };
  hoja.addRow([]);
  const encabezado = hoja.addRow([...ENCABEZADOS]);
  encabezado.font = { bold: true };
  encabezado.eachCell((c) => { c.border = { bottom: { style: 'thin' } }; });
  for (const fila of filasParaExportar(filas)) hoja.addRow(fila).alignment = { vertical: 'top', wrapText: true };
  [20, 24, 18, 22, 48, 36, 36].forEach((ancho, i) => { hoja.getColumn(i + 1).width = ancho; });
  const buffer = await libro.xlsx.writeBuffer();
  descargar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo('xlsx'));
}

export function exportarAuditoriaPdf(filas: readonly RegistroAuditoriaApi[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Auditoría del sistema', 40, 36);
  doc.setFontSize(8);
  doc.text(`Generado el ${fechaHora(new Date().toISOString())}`, 40, 50);
  autoTable(doc, {
    head: [[...ENCABEZADOS]],
    body: filasParaExportar(filas),
    startY: 60,
    styles: { fontSize: 7, cellPadding: 3, valign: 'top' },
    headStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 80 }, 2: { cellWidth: 60 }, 3: { cellWidth: 70 }, 4: { cellWidth: 190 } },
  });
  doc.save(nombreArchivo('pdf'));
}
