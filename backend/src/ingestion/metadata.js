import path from 'node:path';

const MONTHS = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };

/** Derives document type, "family" (same doc across revisions) and effective date from path + text. */
export class MetadataDetector {
  static FOLDER_TYPES = {
    catalog: 'catalog', datasheets: 'datasheet', flyers: 'flyer', manuals: 'manual',
    marketing: 'marketing', pricing: 'pricing', terms: 'terms', service: 'service',
  };

  docType(relPath, fileName) {
    const folder = relPath.split(path.sep).find((p) => MetadataDetector.FOLDER_TYPES[p]);
    if (folder) return MetadataDetector.FOLDER_TYPES[folder];
    // Flat tenant layouts (nordhaven): infer from the file name.
    if (/price/i.test(fileName)) return 'pricing';
    if (/service/i.test(fileName)) return 'manual';
    if (/datasheet/i.test(fileName)) return 'datasheet';
    return 'other';
  }

  familyKey(docType, fileName) {
    const article = fileName.match(/(\d{2}\.\d{4})/)?.[1];
    const variant = /spring[_ ]force/i.test(fileName) ? 'springforce' : docType;
    if (article) return `${variant}:${article}`;
    if (docType === 'pricing') return 'pricing:price_list';
    return `${docType}:${fileName.replace(/\.pdf$/i, '').toLowerCase()}`;
  }

  /** Best-effort effective date (YYYY / YYYY-MM / YYYY-MM-DD) from text, then file name. */
  dates(text, fileName) {
    let m;
    const month = (name) => MONTHS[name.toLowerCase()];
    if ((m = text.match(/Revision\s+(\d{4}-\d{2})/i))) return { effectiveDate: m[1], revision: m[1] };
    if ((m = text.match(/Valid from\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i)) && month(m[2])) return { effectiveDate: `${m[3]}-${month(m[2])}-${m[1].padStart(2, '0')}` };
    if ((m = text.match(/Issue date:\s*(\d{4}-\d{2})/i))) return { effectiveDate: m[1] };
    if ((m = text.match(/Issue date:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i))) return { effectiveDate: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` };
    if ((m = text.match(/Status:\s*([A-Za-z]+)\s+(\d{4})/i)) && month(m[1])) return { effectiveDate: `${m[2]}-${month(m[1])}` };
    if ((m = text.match(/Product News\s*[–-]\s*([A-Za-z]+)\s+(\d{4})/i)) && month(m[1])) return { effectiveDate: `${m[2]}-${month(m[1])}` };
    if ((m = fileName.match(/(\d{4})-(\d{2})/))) return { effectiveDate: `${m[1]}-${m[2]}` };
    if ((m = fileName.match(/(?:^|[_ -])(20\d{2})(?:[_. -]|$)/))) return { effectiveDate: m[1] };
    if ((m = text.match(/Price List\s+(20\d{2})/i))) return { effectiveDate: m[1] };
    if ((m = text.match(/Product range\s+(20\d{2})/i))) return { effectiveDate: m[1] };
    return { effectiveDate: null };
  }
}
