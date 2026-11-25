import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const MAX_EXISTING_CUSTOMER_CAP = 2000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB safety limit

export interface ParsedCustomerContact {
  name: string;
  email: string;
  phone: string;
  preferredService: string;
  notes: string;
}

export interface FileParseSummary {
  fileName: string;
  fileFormat: 'excel' | 'csv' | 'pdf';
  totalRowsScanned: number;
  contacts: ParsedCustomerContact[];
  invalidRows: number;
  inFileDuplicates: number;
  truncatedByCap: number;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}/g;

function normalizeEmail(raw?: string): string {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return '';
  return trimmed;
}

function normalizePhone(raw?: string): string {
  const trimmed = String(raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return trimmed;
}

function extractFirstValidPhone(text: string): string {
  const matches = text.match(PHONE_REGEX);
  if (!matches) return '';
  for (const m of matches) {
    const cleaned = m.trim();
    const digits = cleaned.replace(/\D/g, '');
    // Avoid matching pure dates like 2026-11-25 or 4-digit years
    if (digits.length >= 8 && digits.length <= 15 && !/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(cleaned)) {
      return cleaned;
    }
  }
  return '';
}

function matchHeaderKey(header: string): 'name' | 'email' | 'phone' | 'preferredService' | 'notes' | null {
  const h = header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!h) return null;
  if (/(email|e mail|mail id|mail)/.test(h)) return 'email';
  if (/(phone|mobile|whatsapp|contact no|contact number|tel|cell|number)/.test(h)) return 'phone';
  if (/(service|treatment|category|interest|package|plan)/.test(h)) return 'preferredService';
  if (/(note|remark|comment|tag|source)/.test(h)) return 'notes';
  if (/(name|customer|patient|client|member|guest|contact)/.test(h)) return 'name';
  return null;
}

function parseTabularRows(
  rows: string[][],
  fileName: string,
  fileFormat: 'excel' | 'csv'
): FileParseSummary {
  const nonEmptyRows = rows
    .map((r) => r.map((cell) => String(cell ?? '').trim()))
    .filter((r) => r.some((cell) => cell.length > 0));

  if (nonEmptyRows.length === 0) {
    return {
      fileName,
      fileFormat,
      totalRowsScanned: 0,
      contacts: [],
      invalidRows: 0,
      inFileDuplicates: 0,
      truncatedByCap: 0,
    };
  }

  // Detect if first row is a header row
  const firstRow = nonEmptyRows[0];
  const headerMapping = firstRow.map((cell) => matchHeaderKey(cell));
  const hasHeader = headerMapping.filter(Boolean).length >= 1 && !firstRow.some((c) => EMAIL_REGEX.test(c));

  const dataRows = hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;
  const emailIdx = hasHeader ? headerMapping.indexOf('email') : -1;
  const phoneIdx = hasHeader ? headerMapping.indexOf('phone') : -1;
  const nameIdx = hasHeader ? headerMapping.indexOf('name') : -1;
  const serviceIdx = hasHeader ? headerMapping.indexOf('preferredService') : -1;
  const notesIdx = hasHeader ? headerMapping.indexOf('notes') : -1;

  const contacts: ParsedCustomerContact[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  let invalidRows = 0;
  let inFileDuplicates = 0;
  let truncatedByCap = 0;

  for (const row of dataRows) {
    let email = emailIdx >= 0 ? normalizeEmail(row[emailIdx]) : '';
    let phone = phoneIdx >= 0 ? normalizePhone(row[phoneIdx]) : '';
    let name = nameIdx >= 0 ? (row[nameIdx] || '').trim() : '';
    const preferredService = serviceIdx >= 0 ? (row[serviceIdx] || '').trim() : '';
    const notes = notesIdx >= 0 ? (row[notesIdx] || '').trim() : '';

    // Smart cell scan fallback if column was unnamed or shifted
    if (!email) {
      for (const cell of row) {
        const m = cell.match(EMAIL_REGEX);
        if (m) {
          email = normalizeEmail(m[0]);
          break;
        }
      }
    }
    if (!phone) {
      for (const cell of row) {
        if (cell.includes('@')) continue;
        const p = normalizePhone(cell) || extractFirstValidPhone(cell);
        if (p) {
          phone = p;
          break;
        }
      }
    }
    if (!name) {
      for (const cell of row) {
        if (!cell || cell.includes('@')) continue;
        if (normalizePhone(cell)) continue;
        if (/^[A-Za-z][A-Za-z .'-]{1,60}$/.test(cell)) {
          name = cell;
          break;
        }
      }
    }

    if (!email && !phone) {
      invalidRows += 1;
      continue;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if ((email && seenEmails.has(email)) || (phoneDigits && seenPhones.has(phoneDigits))) {
      inFileDuplicates += 1;
      continue;
    }

    if (contacts.length >= MAX_EXISTING_CUSTOMER_CAP) {
      truncatedByCap += 1;
      continue;
    }

    if (email) seenEmails.add(email);
    if (phoneDigits) seenPhones.add(phoneDigits);

    const fallbackName = email
      ? email.split('@')[0].replace(/[._-]+/g, ' ')
      : `Customer ${phoneDigits.slice(-4)}`;

    contacts.push({
      name: name || fallbackName,
      email,
      phone,
      preferredService,
      notes: notes || `Imported from ${fileFormat.toUpperCase()} (${fileName})`,
    });
  }

  return {
    fileName,
    fileFormat,
    totalRowsScanned: dataRows.length,
    contacts,
    invalidRows,
    inFileDuplicates,
    truncatedByCap,
  };
}

function parseCsvTextToMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const sampleLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = sampleLine.includes('\t') && !sampleLine.includes(',') ? '\t' : ',';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function parsePdfFile(file: File): Promise<FileParseSummary> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const extractedLines: string[] = [];
  const maxPages = Math.min(pdf.numPages, 100);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group PDF text items by approximate Y position to reconstruct visual rows
    const lineBuckets = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const transform = item.transform as number[];
      const x = transform?.[4] ?? 0;
      const y = Math.round((transform?.[5] ?? 0) / 3) * 3;
      const bucket = lineBuckets.get(y) || [];
      bucket.push({ x, text: item.str.trim() });
      lineBuckets.set(y, bucket);
    }

    const sortedY = Array.from(lineBuckets.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const items = lineBuckets.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = items.map((i) => i.text).join('  ').trim();
      if (lineText) extractedLines.push(lineText);
    }
  }

  const contacts: ParsedCustomerContact[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  let invalidRows = 0;
  let inFileDuplicates = 0;
  let truncatedByCap = 0;

  for (const line of extractedLines) {
    const emailMatch = line.match(EMAIL_REGEX);
    const email = emailMatch ? normalizeEmail(emailMatch[0]) : '';
    const lineWithoutEmail = emailMatch ? line.replace(emailMatch[0], ' ') : line;
    const phone = extractFirstValidPhone(lineWithoutEmail);

    if (!email && !phone) {
      invalidRows += 1;
      continue;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if ((email && seenEmails.has(email)) || (phoneDigits && seenPhones.has(phoneDigits))) {
      inFileDuplicates += 1;
      continue;
    }

    if (contacts.length >= MAX_EXISTING_CUSTOMER_CAP) {
      truncatedByCap += 1;
      continue;
    }

    if (email) seenEmails.add(email);
    if (phoneDigits) seenPhones.add(phoneDigits);

    // Strip email & phone to isolate candidate customer name
    const stripped = lineWithoutEmail
      .replace(phone, ' ')
      .replace(/[,|•·;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tokens = stripped
      .split(/\s{2,}|\s+/)
      .filter((t) => /^[A-Za-z][A-Za-z.'-]*$/.test(t));
    const candidateName = tokens.slice(0, 3).join(' ').trim();
    const fallbackName = email
      ? email.split('@')[0].replace(/[._-]+/g, ' ')
      : `Customer ${phoneDigits.slice(-4)}`;

    contacts.push({
      name: candidateName.length >= 2 ? candidateName : fallbackName,
      email,
      phone,
      preferredService: '',
      notes: `Extracted from PDF (${file.name})`,
    });
  }

  return {
    fileName: file.name,
    fileFormat: 'pdf',
    totalRowsScanned: extractedLines.length,
    contacts,
    invalidRows,
    inFileDuplicates,
    truncatedByCap,
  };
}

export async function parseExistingCustomerFile(file: File): Promise<FileParseSummary> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File exceeds the 10 MB limit. Please upload a smaller Excel, CSV, or PDF file.');
  }

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    return parsePdfFile(file);
  }

  if (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    file.type.includes('spreadsheet') ||
    file.type.includes('ms-excel')
  ) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('This Excel workbook does not contain any readable worksheets.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as string[][];
    return parseTabularRows(matrix, file.name, 'excel');
  }

  if (
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.tsv') ||
    lowerName.endsWith('.txt') ||
    file.type.startsWith('text/')
  ) {
    const text = await file.text();
    const matrix = parseCsvTextToMatrix(text);
    return parseTabularRows(matrix, file.name, 'csv');
  }

  throw new Error('Unsupported file format. Please upload an Excel (.xlsx / .xls), CSV (.csv), or PDF (.pdf) file.');
}

export function buildSampleImportBatch(): FileParseSummary {
  return {
    fileName: 'existing-patients-export.xlsx',
    fileFormat: 'excel',
    totalRowsScanned: 6,
    invalidRows: 0,
    inFileDuplicates: 0,
    truncatedByCap: 0,
    contacts: [
      {
        name: 'Sandeep Kulkarni',
        email: 'sandeep.kulkarni@example.com',
        phone: '+91 98451 77201',
        preferredService: 'General Consultation',
        notes: 'Imported from Excel (existing-patients-export.xlsx)',
      },
      {
        name: 'Aishwarya Nair',
        email: 'aishwarya.nair@example.com',
        phone: '+91 99004 32198',
        preferredService: 'Smile Whitening Therapy',
        notes: 'Imported from Excel (existing-patients-export.xlsx)',
      },
      {
        name: 'Pranav Deshmukh',
        email: 'pranav.deshmukh@example.com',
        phone: '+91 97412 88905',
        preferredService: 'Full Preventive Cleaning & Polish',
        notes: 'Imported from Excel (existing-patients-export.xlsx)',
      },
      {
        name: 'Ritika Banerjee',
        email: 'ritika.b@example.com',
        phone: '+91 98867 45120',
        preferredService: 'Premium Consultation & 3D Scan',
        notes: 'Imported from Excel (existing-patients-export.xlsx)',
      },
      {
        name: 'Harsha Vardhan',
        email: 'harsha.v@example.com',
        phone: '+91 96118 60342',
        preferredService: 'General Consultation',
        notes: 'Imported from Excel (existing-patients-export.xlsx)',
      },
      {
        name: 'Nandini Rao',
        email: 'nandini.rao@example.com',
        phone: '+91 98458 29014',
        preferredService: 'Full Preventive Cleaning & Polish',
        notes: 'Imported from Excel (existing-patients-export.xlsx)',
      },
    ],
  };
}
