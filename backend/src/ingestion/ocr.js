import fs from 'node:fs/promises';
import { HumanMessage } from '@langchain/core/messages';
import { chatModel } from '../llm/models.js';
import { BUDGETS, TokenBudget } from '../llm/budget.js';
import { getLogger } from '../logger/index.js';

const log = getLogger('ocr');

const OCR_PROMPT = `Transcribe this scanned document page by page, exactly as printed.
Keep tables as rows with cells separated by " | ". Do not summarise, translate, correct or add anything.
Separate pages with a line "=====PAGE n=====". Output only the transcription.`;

/** OCR for scanned PDFs through Gemini's native PDF input. The content is only transcribed, never obeyed. */
export class GeminiOcr {
  /** @returns {Promise<Map<number,string>>} page number -> text */
  async recognize(filePath, usage) {
    const base64 = (await fs.readFile(filePath)).toString('base64');
    const msg = new HumanMessage({
      content: [
        { type: 'text', text: OCR_PROMPT },
        { type: 'media', mimeType: 'application/pdf', data: base64 },
      ],
    });
    const res = await chatModel(BUDGETS.ocr).invoke([msg]);
    usage?.addMessage(res);
    TokenBudget.assertComplete(res, 'ocr');
    const raw = typeof res.content === 'string' ? res.content : res.content.map((c) => c.text ?? '').join('');
    const pages = new Map();
    const parts = raw.split(/=====PAGE\s+(\d+)=====/);
    if (parts.length === 1) pages.set(1, raw.trim());
    else for (let i = 1; i < parts.length; i += 2) pages.set(Number(parts[i]), parts[i + 1].trim());
    log.info({ filePath, pages: pages.size }, 'ocr done');
    return pages;
  }
}
