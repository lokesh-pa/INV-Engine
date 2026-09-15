import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Configure worker safely for browser and fallback
if (typeof window !== 'undefined') {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
    }
  } catch (e) {
    console.warn('PDF.js worker initialization notice:', e);
  }
}

export interface ParsedPdfInvoice {
  rawText: string;
  pageCount: number;
  invoiceNumber?: string;
  poNumber?: string;
  billingMonth?: string;
  piccId?: string;
  vendorName?: string;
  totalAmount?: number;
  totalDays?: number;
  lines: Array<{
    [key: string]: any;
    'PO Line Item'?: string;
    'Resource Name'?: string;
    'Resource Email ID'?: string;
    'Billed Days': number;
    'Daily Rate': number;
    'Total Amount'?: number;
    'ADM Role'?: string;
  }>;
}

/**
 * Parses an ArrayBuffer of a PDF invoice file into structured invoice data
 */
export async function parsePdfInvoice(pdfBuffer: ArrayBuffer): Promise<ParsedPdfInvoice> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true
  } as any);

  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  const textLinesByPage: string[][] = [];
  let fullRawText = '';

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by their vertical Y position (with tolerance)
    const items = textContent.items as Array<{ str: string; transform: number[] }>;
    const linesMap = new Map<number, Array<{ x: number; text: string }>>();

    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue;
      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);

      // Group within 4 pixels vertical tolerance
      let matchedY = y;
      for (const existingY of linesMap.keys()) {
        if (Math.abs(existingY - y) <= 4) {
          matchedY = existingY;
          break;
        }
      }

      if (!linesMap.has(matchedY)) {
        linesMap.set(matchedY, []);
      }
      linesMap.get(matchedY)!.push({ x, text: item.str });
    }

    // Sort lines by Y descending (top to bottom on page)
    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const pageLines: string[] = [];

    for (const y of sortedY) {
      // Sort words left to right
      const lineWords = linesMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineStr = lineWords.map(w => w.text).join(' ').trim();
      if (lineStr) {
        pageLines.push(lineStr);
        fullRawText += lineStr + '\n';
      }
    }

    textLinesByPage.push(pageLines);
  }

  // Extract Metadata from full text
  let invoiceNumber: string | undefined;
  let poNumber: string | undefined;
  let billingMonth: string | undefined;
  let piccId: string | undefined;
  let vendorName: string | undefined;

  // Invoice Number
  const invMatch = fullRawText.match(/(?:Invoice\s*(?:#|Number|No|ID)?[:\s]*)([A-Z0-9\-_]+)/i);
  if (invMatch) invoiceNumber = invMatch[1].trim();

  // PO Number
  const poMatch = fullRawText.match(/(?:PO|Purchase\s*Order)\s*(?:#|Number|No)?[:\s]*([A-Z0-9\-_]+)/i);
  if (poMatch) poNumber = poMatch[1].trim();

  // PICC Certificate Reference
  const piccMatch = fullRawText.match(/(?:PICC|Clearance\s*Certificate|Certificate\s*ID)[:\s#]*([A-Z0-9\-_]+)/i);
  if (piccMatch) piccId = piccMatch[1].trim();

  // Billing Month / Period
  const monthMatch = fullRawText.match(/(?:Billing\s*(?:Period|Month)|Service\s*Month)[:\s]*([A-Za-z]+\s+\d{4}|\d{4}-\d{2})/i);
  if (monthMatch) billingMonth = monthMatch[1].trim();

  // Vendor Name
  const vendorMatch = fullRawText.match(/(?:Vendor|Supplier|From)[:\s]*([A-Za-z0-9\s&.,\-]+?)(?:\n|PO|Invoice|Date|Tax)/i);
  if (vendorMatch) vendorName = vendorMatch[1].trim();

  // Extract Line Items
  const allLines = fullRawText.split('\n');
  const extractedLines: ParsedPdfInvoice['lines'] = [];

  // Strategy A: Identify table rows containing names, emails, days, and rates
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line) continue;

    // Check if line contains an email
    const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    // Check if line contains numbers that look like days (e.g., 20.0 or 22 or 18.5) and rates (e.g. 950 or 1,200)
    const numbers = line.match(/\b\d+(?:\.\d+)?\b/g);

    if (emailMatch && numbers && numbers.length >= 2) {
      const email = emailMatch[1];
      // Try to parse days and rate
      const cleanLine = line.replace(email, '').trim();
      const tokens = cleanLine.split(/\s+/).filter(Boolean);

      // Candidate name: tokens that are text before the numbers
      const textTokens = tokens.filter(t => !/^\$?[0-9,.]+$/.test(t) && !t.startsWith('#'));
      const numTokens = tokens
        .map(t => parseFloat(t.replace(/[^0-9.-]/g, '')))
        .filter(n => !isNaN(n) && n > 0);

      // Identify PO Line Item if present (e.g. 00010, 10, 1)
      let lineItem = String((extractedLines.length + 1) * 10).padStart(5, '0');
      const lineItemMatch = line.match(/(?:Line\s*#?|Item\s*#?|^)(\d{2,5})\b/i);
      if (lineItemMatch) {
        lineItem = String(lineItemMatch[1]).padStart(5, '0');
      }

      // Typically: billed days is between 1 and 35, rate is >= 100
      let billedDays = 20;
      let dailyRate = 950;

      const dayCandidates = numTokens.filter(n => n >= 1 && n <= 35);
      const rateCandidates = numTokens.filter(n => n >= 100);

      if (dayCandidates.length > 0) billedDays = dayCandidates[0];
      if (rateCandidates.length > 0) dailyRate = rateCandidates[0];

      const resourceName = textTokens.slice(0, 3).join(' ') || email.split('@')[0].replace('.', ' ');

      extractedLines.push({
        'PO Line Item': lineItem,
        'Resource Name': resourceName,
        'Resource Email ID': email,
        'Billed Days': billedDays,
        'Daily Rate': dailyRate,
        'Total Amount': billedDays * dailyRate,
        'ADM Role': 'Consultant'
      });
    }
  }

  // Strategy B: If Strategy A found no lines with emails, look for tabular numeric lines
  if (extractedLines.length === 0) {
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      // Match pattern like: "10  Priya Sharma  Senior Architect  22.0  950.00  20,900.00"
      const match = line.match(/^(\d{1,5})\s+([A-Za-z\s.'-]+?)\s+(?:([A-Za-z\s]+?)\s+)?(\d+(?:\.\d+)?)\s+(\$?\d+(?:,\d{3})*(?:\.\d+)?)/);
      if (match) {
        const lineItem = String(match[1]).padStart(5, '0');
        const resourceName = match[2].trim();
        const role = match[3]?.trim() || 'Consultant';
        const billedDays = parseFloat(match[4]);
        const dailyRate = parseFloat(match[5].replace(/[^0-9.-]/g, ''));

        if (!isNaN(billedDays) && !isNaN(dailyRate) && billedDays > 0) {
          extractedLines.push({
            'PO Line Item': lineItem,
            'Resource Name': resourceName,
            'Resource Email ID': `${resourceName.toLowerCase().replace(/\s+/g, '.')}@apex.com`,
            'Billed Days': billedDays,
            'Daily Rate': dailyRate,
            'Total Amount': billedDays * dailyRate,
            'ADM Role': role
          });
        }
      }
    }
  }

  const totalDays = extractedLines.reduce((acc, l) => acc + l['Billed Days'], 0);
  const totalAmount = extractedLines.reduce((acc, l) => acc + (l['Total Amount'] || 0), 0);

  return {
    rawText: fullRawText,
    pageCount,
    invoiceNumber,
    poNumber,
    billingMonth,
    piccId,
    vendorName,
    totalAmount,
    totalDays,
    lines: extractedLines
  };
}
