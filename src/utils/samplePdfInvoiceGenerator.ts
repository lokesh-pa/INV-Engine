import { InvoiceBatch } from '../types';

/**
 * Generates a valid standard PDF 1.4 document containing commercial vendor invoice data
 */
export function generateSampleInvoicePdfBlob(
  batch: InvoiceBatch,
  isTampered: boolean = false
): Blob {
  const invoiceNum = isTampered ? `INV-TAMPERED-${batch.poNumber.slice(-4)}` : `INV-${batch.poNumber.slice(-4)}-001`;
  const certId = batch.clearanceCertificate?.certificateId || `PICC-${batch.poNumber.slice(-4)}-4821`;

  const headerLines = [
    `COMMERCIAL TAX INVOICE - ${batch.vendorName.toUpperCase()}`,
    `Invoice #: ${invoiceNum}`,
    `Purchase Order: ${batch.poNumber}`,
    `Billing Month: ${batch.billingMonth}`,
    `PICC Reference: ${certId}`,
    `Vendor: ${batch.vendorName} (${batch.vendorEmail})`,
    `Invoice Date: ${new Date().toISOString().slice(0, 10)}`,
    `Status: ${isTampered ? 'UNAUTHORIZED VARIANCE INVOICE (TEST)' : 'MANAGER-APPROVED CLEARANCE COMPLIANT'}`,
    `------------------------------------------------------------------------------------------------------------------------`,
    `PO Line  Consultant Name            Email Address                       Days   Daily Rate    Total Amount`,
    `------------------------------------------------------------------------------------------------------------------------`
  ];

  const itemLines = batch.items.map((item, idx) => {
    const lineItem = item.poLineItem || String((idx + 1) * 10).padStart(5, '0');
    // If tampered, inflate days by 2.0 or 3.0 days for test
    const approvedDays = item.managerDecision?.finalApprovedDays ?? (item.status === 'APPROVED_ROUTINE' ? item.billedDays : item.internalApprovedDays);
    const days = isTampered && idx === 0 ? approvedDays + 3.0 : approvedDays;
    const rate = item.claimedDailyRate || item.contractDailyRate;
    const lineTotal = days * rate;

    const pad = (s: string, len: number) => s.padEnd(len, ' ').slice(0, len);
    const line = `${pad(lineItem, 8)} ${pad(item.resourceName, 26)} ${pad(item.resourceEmail, 35)} ${pad(days.toFixed(1), 6)} ${pad('$' + rate.toFixed(2), 13)} $${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    return line;
  });

  const totalDays = batch.items.reduce((acc, it, idx) => {
    const approvedDays = it.managerDecision?.finalApprovedDays ?? (it.status === 'APPROVED_ROUTINE' ? it.billedDays : it.internalApprovedDays);
    const days = isTampered && idx === 0 ? approvedDays + 3.0 : approvedDays;
    return acc + days;
  }, 0);

  const totalAmount = batch.items.reduce((acc, it, idx) => {
    const approvedDays = it.managerDecision?.finalApprovedDays ?? (it.status === 'APPROVED_ROUTINE' ? it.billedDays : it.internalApprovedDays);
    const days = isTampered && idx === 0 ? approvedDays + 3.0 : approvedDays;
    const rate = it.claimedDailyRate || it.contractDailyRate;
    return acc + days * rate;
  }, 0);

  const footerLines = [
    `------------------------------------------------------------------------------------------------------------------------`,
    `TOTAL BILLED DAYS: ${totalDays.toFixed(1)} Days`,
    `SUBTOTAL (PRE-TAX INDICATIVE): $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `VAT / TAX (EXCLUDED FROM 3-WAY MATCH): $0.00`,
    `TOTAL PAYABLE: $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `------------------------------------------------------------------------------------------------------------------------`,
    `Payment Terms: Net 30 Days | Electronic Funds Transfer`,
    `SAP Ariba Network Supplier ID: ANID-9041284-APEX`,
    `Certified compliant with AB Company Pre-Invoice Clearance Certificate (PICC) requirements.`
  ];

  const allLines = [...headerLines, ...itemLines, ...footerLines];

  // Construct PDF stream with font Helvetica
  const streamCommands = allLines.map((line, idx) => {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    // 760 down to 40
    const yPos = 760 - idx * 14;
    return `BT /F1 9 Tf 36 ${yPos} Td (${escaped}) Tj ET`;
  }).join('\n');

  const streamLen = new TextEncoder().encode(streamCommands).length;

  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj`,
    `5 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamCommands}\nendstream\nendobj`
  ];

  let pdfContent = `%PDF-1.4\n`;
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdfContent.length);
    pdfContent += obj + '\n';
  }

  const xrefOffset = pdfContent.length;
  pdfContent += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdfContent += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfContent += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdfContent], { type: 'application/pdf' });
}

/**
 * Trigger download of generated PDF
 */
export function downloadSampleInvoicePdf(batch: InvoiceBatch, isTampered: boolean = false): void {
  const blob = generateSampleInvoicePdfBlob(batch, isTampered);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${isTampered ? 'Tampered' : 'Valid'}_Vendor_Invoice_${batch.poNumber}_${batch.billingMonth.replace(/\s+/g, '_')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
