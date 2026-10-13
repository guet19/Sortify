// Etiketten als PDF: 70 × 37 mm, 3 × 8 pro A4-Blatt (z.B. Zweckform 3475 / Herma 4453)
// Läuft im Browser; jsPDF und qrcode werden erst beim Drucken geladen.

const LABEL = { width: 70, height: 37, cols: 3, rows: 8, marginTop: 0.5, marginLeft: 0 };

// labels: [{ qr: 'Inhalt des QR-Codes', title: 'Grosse Zeile', lines: ['kleine Zeilen', ...] }]
export async function downloadLabelsPdf(labels, filename) {
    const [{ jsPDF }, QRCode] = await Promise.all([import('jspdf'), import('qrcode')]);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const perPage = LABEL.cols * LABEL.rows;

    for (let i = 0; i < labels.length; i++) {
        if (i > 0 && i % perPage === 0) doc.addPage();
        const pos = i % perPage;
        const x = LABEL.marginLeft + (pos % LABEL.cols) * LABEL.width;
        const y = LABEL.marginTop + Math.floor(pos / LABEL.cols) * LABEL.height;
        const label = labels[i];

        const qr = await QRCode.toDataURL(label.qr, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
        doc.addImage(qr, 'PNG', x + 3, y + 4.5, 28, 28);

        const textX = x + 34, maxWidth = LABEL.width - 37;
        doc.setFont('helvetica', 'bold');
        // Kurze Barcodes gross, lange Artikelnamen kleiner und auf bis zu 3 Zeilen
        const long = label.title.length > 24;
        const titleSize = long ? 9 : label.title.length > 14 ? 11 : 15;
        doc.setFontSize(titleSize);
        const titleLines = doc.splitTextToSize(label.title, maxWidth).slice(0, long ? 3 : 2);
        doc.text(titleLines, textX, y + 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        let lineY = y + 10 + titleLines.length * titleSize * 0.42 + 1.5;
        for (const line of label.lines || []) {
            const wrapped = doc.splitTextToSize(String(line), maxWidth).slice(0, 2);
            doc.text(wrapped, textX, lineY);
            lineY += wrapped.length * 3.6;
            if (lineY > y + LABEL.height - 3) break;
        }
    }
    doc.save(filename);
}
