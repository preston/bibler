// Author: Preston Lee

import { Injectable } from '@angular/core';
import * as mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

/** Max extracted text per batch before warning (128 KB). */
export const EXTRACTED_TEXT_WARN_BYTES = 128 * 1024;

@Injectable({
  providedIn: 'root'
})
export class DocumentExtractionService {
  constructor() {
    GlobalWorkerOptions.workerSrc = new URL('assets/pdf.worker.min.mjs', document.baseURI).href;
  }

  async extractText(file: File): Promise<{ text: string; error?: string }> {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.txt') || name.endsWith('.md')) {
        return { text: await file.text() };
      }
      if (name.endsWith('.docx')) {
        const buf = await file.arrayBuffer();
        const r = await mammoth.extractRawText({ arrayBuffer: buf });
        return { text: r.value };
      }
      if (name.endsWith('.pdf')) {
        const buf = await file.arrayBuffer();
        const pdf = await getDocument({ data: buf }).promise;
        let out = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const line = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
          out += line + '\n';
        }
        return { text: out };
      }
      if (name.endsWith('.rtf')) {
        const raw = await file.text();
        return { text: this.stripRtf(raw) };
      }
      return { text: '', error: 'Unsupported file type.' };
    } catch (e) {
      return { text: '', error: e instanceof Error ? e.message : 'Extraction failed.' };
    }
  }

  /** Minimal RTF text strip (best-effort). */
  private stripRtf(s: string): string {
    let t = s.replace(/\r\n/g, '\n');
    t = t.replace(/\\'[0-9a-fA-F]{2}/g, (m) => {
      const hex = m.slice(2);
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
    t = t.replace(/\\[a-z]+\d* ?/gi, '');
    t = t.replace(/[{}]/g, '');
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  totalUtf8Bytes(s: string): number {
    return new Blob([s]).size;
  }
}
