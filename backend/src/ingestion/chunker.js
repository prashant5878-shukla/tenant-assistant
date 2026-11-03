/**
 * One chunk per page keeps tables and the product name together (the corpus is page-structured).
 * Oversized pages are split on line boundaries. Every chunk is prefixed with a header so file,
 * page and date become part of the embedded and the cited text.
 */
export class PageChunker {
  constructor({ maxChars = 2400 } = {}) {
    this.maxChars = maxChars;
  }

  header({ tenant, fileName, docType, page, effectiveDate }) {
    return `[tenant=${tenant} | file=${fileName} | type=${docType} | page=${page}${effectiveDate ? ` | dated=${effectiveDate}` : ''}]`;
  }

  chunk(doc, pages) {
    const out = [];
    for (const p of pages) {
      const text = p.text.trim();
      if (!text) continue;
      this.#split(text).forEach((body, part) =>
        out.push({
          fileName: doc.fileName, page: p.page, part, docType: doc.docType, effectiveDate: doc.effectiveDate,
          status: doc.status ?? 'current',
          text: `${this.header({ ...doc, page: p.page })}\n${body}`,
        }),
      );
    }
    return out;
  }

  #split(text) {
    if (text.length <= this.maxChars) return [text];
    const parts = [];
    let cur = '';
    for (const line of text.split('\n')) {
      if (cur && cur.length + line.length + 1 > this.maxChars) {
        parts.push(cur);
        cur = '';
      }
      cur += (cur ? '\n' : '') + line;
    }
    if (cur) parts.push(cur);
    return parts;
  }
}
