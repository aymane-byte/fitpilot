// Génération du PDF (jsPDF chargé à la demande, uniquement quand on exporte).

/** Les polices standard de jsPDF ne couvrent que le Latin-1 : on remplace les caractères hors table. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[−–—]/g, '-')
    .replace(/≈/g, '~')
    .replace(/…/g, '...')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[  ]/g, ' ')
    .replace(/•/g, '-')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, '');
}

export interface PdfSection {
  title: string;
  rows?: [string, string][];
  text?: string;
}

export async function buildPdf(title: string, subtitle: string, sections: PdfSection[], footer: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  let y = M;
  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };

  doc.setFillColor(198, 255, 61);
  doc.rect(0, 0, W, 6, 'F');
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(pdfSafe(title), M, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(pdfSafe(subtitle), M, y);
  doc.setTextColor(0);
  y += 10;

  for (const s of sections) {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(pdfSafe(s.title), M, y);
    y += 6;
    doc.setFontSize(10.5);
    for (const [k, v] of s.rows ?? []) {
      ensure(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90);
      doc.text(pdfSafe(k), M, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfSafe(v), W - M, y, { align: 'right' });
      y += 6.5;
    }
    if (s.text) {
      doc.setFont('helvetica', 'normal');
      for (const line of doc.splitTextToSize(pdfSafe(s.text), W - 2 * M) as string[]) {
        ensure(5.5);
        doc.text(line, M, y);
        y += 5.2;
      }
    }
    y += 5;
  }
  ensure(10);
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  for (const line of doc.splitTextToSize(pdfSafe(footer), W - 2 * M) as string[]) {
    doc.text(line, M, y);
    y += 4.2;
  }
  return doc.output('blob');
}
