import PDFDocument from "pdfkit";

export type Col = { key: string; label: string; width: number; align?: "left" | "right" };

export function renderPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const parts: Buffer[] = [];
    doc.on("data", (b: Buffer) => parts.push(b));
    doc.on("end", () => resolve(Buffer.concat(parts)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

export function title(doc: PDFKit.PDFDocument, text: string, sub?: string) {
  doc.fontSize(20).fillColor("#0f172a").text(text);
  if (sub) doc.moveDown(0.2).fontSize(10).fillColor("#64748b").text(sub);
  doc.moveDown(0.8).fillColor("#0f172a");
}
export function heading(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.6).fontSize(13).fillColor("#0f172a").text(text).moveDown(0.3);
  doc.fontSize(10);
}
export function para(doc: PDFKit.PDFDocument, label: string, text: string) {
  if (doc.y > 700) doc.addPage();
  doc.fontSize(10).fillColor("#475569").text(label);
  doc.fillColor("#0f172a").text(text).moveDown(0.5);
}

export function table(
  doc: PDFKit.PDFDocument,
  cols: Col[],
  rows: Record<string, string | number | null>[],
) {
  const x0 = doc.page.margins.left;
  const draw = (cells: string[], bold: boolean) => {
    let x = x0;
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    cols.forEach((c, i) => {
      doc.text(cells[i] ?? "", x, y, {
        width: c.width - 6,
        align: c.align ?? "left",
        lineBreak: false,
        ellipsis: true,
      });
      x += c.width;
    });
    doc.y = y + 15;
  };
  draw(
    cols.map((c) => c.label),
    true,
  );
  doc
    .moveTo(x0, doc.y - 3)
    .lineTo(x0 + cols.reduce((s, c) => s + c.width, 0), doc.y - 3)
    .strokeColor("#cbd5e1")
    .stroke();
  for (const r of rows) {
    if (doc.y > 770) {
      doc.addPage();
      draw(
        cols.map((c) => c.label),
        true,
      );
    }
    draw(
      cols.map((c) => String(r[c.key] ?? "")),
      false,
    );
  }
  doc.font("Helvetica").moveDown(0.5);
}

/** Simple vertical bar chart drawn with PDF primitives. */
export function barChart(
  doc: PDFKit.PDFDocument,
  data: { label: string; value: number }[],
  opts: { title: string; width?: number; height?: number },
) {
  const w = opts.width ?? 500;
  const h = opts.height ?? 110;
  if (doc.y + h + 40 > 780) doc.addPage();
  const x0 = doc.page.margins.left;
  const top = doc.y + 16;
  doc.fontSize(10).fillColor("#475569").text(opts.title, x0, doc.y);
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 6;
  const bw = Math.max(6, (w - gap * (data.length + 1)) / Math.max(1, data.length));
  data.forEach((d, i) => {
    const bh = (d.value / max) * (h - 28);
    const x = x0 + gap + i * (bw + gap);
    doc.rect(x, top + (h - 28) - bh, bw, bh).fill("#2563eb");
    doc
      .fillColor("#0f172a")
      .fontSize(7)
      .text(String(Math.round(d.value)), x - 4, top + (h - 28) - bh - 9, {
        width: bw + 8,
        align: "center",
        lineBreak: false,
      });
    doc
      .fillColor("#64748b")
      .text(d.label, x - 4, top + h - 24, { width: bw + 8, align: "center", lineBreak: false });
  });
  doc.y = top + h;
  doc.fillColor("#0f172a").fontSize(10);
}
