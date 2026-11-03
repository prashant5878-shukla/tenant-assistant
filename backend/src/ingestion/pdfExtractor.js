import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Text extraction with pdf.js. Rebuilds visual rows from text positions so tables survive
 * as "cell | cell | cell" lines instead of one cell per line.
 */
export class PdfExtractor {
  static Y_TOLERANCE = 3; // points: items with baselines closer than this form one row
  static COLUMN_GAP = 12; // points: horizontal gap that separates table cells
  static MIN_TEXT_CHARS = 20; // fewer non-space chars => treat the page as having no text layer

  /** @returns {Promise<{pages:{page:number,text:string,hasTextLayer:boolean}[],pageCount:number}>} */
  async extract(filePath) {
    const data = new Uint8Array(await fs.readFile(filePath));
    const task = getDocument({ data, useSystemFonts: true, verbosity: 0 });
    const pdf = await task.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      const text = this.#itemsToLines(content.items).join('\n');
      pages.push({ page: n, text, hasTextLayer: text.replace(/\s/g, '').length >= PdfExtractor.MIN_TEXT_CHARS });
    }
    const pageCount = pdf.numPages;
    await task.destroy();
    return { pages, pageCount };
  }

  #itemsToLines(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = it.transform[5];
      const x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) <= PdfExtractor.Y_TOLERANCE);
      if (!row) rows.push((row = { y, cells: [] }));
      row.cells.push({ x, end: x + (it.width || 0), str: it.str });
    }
    rows.sort((a, b) => b.y - a.y); // PDF y axis grows upwards

    return rows.map((row) => {
      row.cells.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      for (const c of row.cells) {
        if (prevEnd === null) line = c.str;
        else {
          const gap = c.x - prevEnd;
          line += gap > PdfExtractor.COLUMN_GAP ? ` | ${c.str}` : gap > 1 ? ` ${c.str}` : c.str;
        }
        prevEnd = c.end;
      }
      return line.trim();
    });
  }
}
