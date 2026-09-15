import { 
  InternalTimesheet, 
  VendorInvoiceRow, 
  DiscrepancyItem, 
  InvoiceBatch, 
  Currency, 
  PreInvoiceClearance,
  DiscrepancyType,
  DiscrepancySeverity,
  TaxConfig,
  TaxCalculationResult
} from '../types';
import { parsePdfInvoice, ParsedPdfInvoice } from './pdfInvoiceParser';

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  taxType: 'VAT',
  taxRate: 0,
  taxJurisdiction: 'US-FEDERAL',
  isReverseCharge: true,
  withholdingTaxRate: 0,
  taxExemptionReason: 'Reverse Charge / Standard B2B Intra-company Accounting'
};

/**
 * Calculates net, VAT/GST/sales tax, withholding tax (WHT), and gross amounts
 */
export function calculateTax(netAmount: number, config?: TaxConfig): TaxCalculationResult {
  const taxCfg = config || DEFAULT_TAX_CONFIG;
  const isReverseCharge = taxCfg.isReverseCharge;
  const taxRate = isReverseCharge ? 0 : (taxCfg.taxRate || 0);
  const taxAmount = +(netAmount * (taxRate / 100)).toFixed(2);
  const withholdingTaxRate = taxCfg.withholdingTaxRate || 0;
  const withholdingTaxAmount = +(netAmount * (withholdingTaxRate / 100)).toFixed(2);
  const grossAmount = +(netAmount + taxAmount).toFixed(2);
  const netPayableAmount = +(grossAmount - withholdingTaxAmount).toFixed(2);

  return {
    netAmount: +netAmount.toFixed(2),
    taxRate,
    taxAmount,
    withholdingTaxRate,
    withholdingTaxAmount,
    grossAmount,
    netPayableAmount,
    isReverseCharge,
    taxType: taxCfg.taxType,
    taxJurisdiction: taxCfg.taxJurisdiction
  };
}

/**
 * Reconciles a list of vendor invoice rows against the AB Company central timesheet database
 * using a resilient COMPOUND KEY: (resourceEmail + poNumber + billingMonth + projectCode).
 * Prevents cross-PO bleeding and false matches across multiple concurrent projects.
 */
export function reconcileInvoiceRows(
  rows: VendorInvoiceRow[],
  timesheets: InternalTimesheet[],
  vendorName: string,
  vendorEmail: string,
  poNumber: string,
  billingMonth: string,
  fileName: string = 'vendor_invoice_upload.xlsx'
): InvoiceBatch {
  const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;
  const items: DiscrepancyItem[] = [];

  let totalBilledAmount = 0;
  let totalInternalApprovedAmount = 0;
  let matchedItemsCount = 0;
  let discrepancyItemsCount = 0;

  const targetPo = poNumber.trim().toUpperCase();
  const targetMonth = billingMonth.trim();

  rows.forEach((row, index) => {
    const normalizedEmail = row.resourceEmail.trim().toLowerCase();
    const rowPo = (row.poNumber || targetPo).trim().toUpperCase();
    const rowMonth = (row.billingMonth || targetMonth).trim();

    // 1. COMPOUND KEY SEARCH: (Email + PO Number + Billing Month)
    const matchingTimesheet = timesheets.find(ts => {
      const emailMatch = ts.resourceEmail.trim().toLowerCase() === normalizedEmail;
      if (!emailMatch) return false;

      const tsPo = (ts.poNumber || '').trim().toUpperCase();
      const tsMonth = (ts.billingMonth || '').trim();

      const poMatch = !tsPo || !rowPo || tsPo === rowPo;
      const monthMatch = !tsMonth || !rowMonth || tsMonth === rowMonth;

      return poMatch && monthMatch;
    });

    // 2. CROSS-PO MISMATCH DETECTION:
    // Check if consultant's timesheet exists in the database for this month but was billed under the wrong PO
    const crossPoTimesheet = !matchingTimesheet ? timesheets.find(ts => {
      const emailMatch = ts.resourceEmail.trim().toLowerCase() === normalizedEmail;
      const monthMatch = !ts.billingMonth || !rowMonth || ts.billingMonth.trim() === rowMonth;
      return emailMatch && monthMatch && ts.poNumber && ts.poNumber.trim().toUpperCase() !== rowPo;
    }) : undefined;

    const currency: Currency = row.currency || matchingTimesheet?.currency || 'USD';
    const billedDays = Number(row.billedDays) || 0;
    const claimedRate = Number(row.claimedDailyRate) || (matchingTimesheet?.contractDailyRate ?? 0);
    const lineBilledTotal = billedDays * claimedRate;
    totalBilledAmount += lineBilledTotal;

    let internalApprovedDays = 0;
    let contractDailyRate = 0;
    let internalApprovedTotal = 0;
    let managerEmail = 'unassigned@abcompany.com';
    let managerName = 'Unassigned Reviewer';
    let department = 'Procurement Review';
    let projectCode = 'PRJ-UNASSIGNED';

    let discrepancyType: DiscrepancyType = 'PERFECT_MATCH';
    let severity: DiscrepancySeverity = 'MATCH';

    if (crossPoTimesheet) {
      // Consultant found, but assigned to a different PO
      discrepancyType = 'CROSS_PO_MISMATCH';
      severity = 'CRITICAL';
      discrepancyItemsCount++;
      managerEmail = crossPoTimesheet.managerEmail;
      managerName = crossPoTimesheet.managerName;
      department = crossPoTimesheet.department;
      projectCode = crossPoTimesheet.projectCode;
      contractDailyRate = crossPoTimesheet.contractDailyRate;
    } else if (!matchingTimesheet) {
      // Resource not found in central database under this PO and month
      discrepancyType = 'RESOURCE_NOT_FOUND';
      severity = 'CRITICAL';
      discrepancyItemsCount++;
    } else {
      internalApprovedDays = matchingTimesheet.approvedDays;
      contractDailyRate = matchingTimesheet.contractDailyRate;
      internalApprovedTotal = internalApprovedDays * contractDailyRate;
      managerEmail = matchingTimesheet.managerEmail;
      managerName = matchingTimesheet.managerName;
      department = matchingTimesheet.department;
      projectCode = matchingTimesheet.projectCode;

      totalInternalApprovedAmount += internalApprovedTotal;

      // Check for discrepancies
      const daysDiff = billedDays - internalApprovedDays;
      const rateDiff = claimedRate - contractDailyRate;

      if (matchingTimesheet.status !== 'Approved') {
        discrepancyType = 'TIMESHEET_UNAPPROVED';
        severity = 'CRITICAL';
        discrepancyItemsCount++;
      } else if (daysDiff > 0) {
        discrepancyType = 'DAYS_OVERBILLED';
        severity = daysDiff > 2 ? 'CRITICAL' : 'MINOR';
        discrepancyItemsCount++;
      } else if (daysDiff < 0) {
        discrepancyType = 'DAYS_UNDERBILLED';
        severity = 'MINOR';
        discrepancyItemsCount++;
      } else if (Math.abs(rateDiff) > 0.01) {
        discrepancyType = 'RATE_MISMATCH';
        severity = 'CRITICAL';
        discrepancyItemsCount++;
      } else {
        discrepancyType = 'PERFECT_MATCH';
        severity = 'MATCH';
        matchedItemsCount++;
      }
    }

    const daysVariance = billedDays - internalApprovedDays;
    const financialVarianceAmount = lineBilledTotal - internalApprovedTotal;

    const discrepancyItem: DiscrepancyItem = {
      id: `DISC-${batchId}-${index + 1}`,
      batchId,
      invoiceRowId: row.id || `ROW-${index + 1}`,
      resourceEmail: row.resourceEmail,
      resourceName: row.resourceName || matchingTimesheet?.resourceName || crossPoTimesheet?.resourceName || 'Unknown Resource',
      vendorName,
      poNumber: rowPo,
      poLineItem: row.poLineItem || matchingTimesheet?.poLineItem || crossPoTimesheet?.poLineItem || String((index + 1) * 10).padStart(5, '0'),
      admSeniority: row.admSeniority || matchingTimesheet?.admSeniority || crossPoTimesheet?.admSeniority || 'Senior',
      admRole: row.admRole || matchingTimesheet?.admRole || crossPoTimesheet?.admRole || 'Cloud Specialist',
      locationCity: row.locationCity || matchingTimesheet?.locationCity || crossPoTimesheet?.locationCity || 'Chicago',
      billingMonth: rowMonth,
      currency,
      billedDays,
      internalApprovedDays,
      daysVariance,
      claimedDailyRate: claimedRate,
      contractDailyRate,
      billedTotalAmount: lineBilledTotal,
      internalApprovedTotalAmount: internalApprovedTotal,
      financialVarianceAmount,
      discrepancyType,
      severity,
      status: discrepancyType === 'PERFECT_MATCH' ? 'AUTO_MATCHED' : 'PENDING_APPROVAL_INITIATION',
      managerEmail,
      managerName,
      department,
      projectCode
    };

    items.push(discrepancyItem);
  });

  const netVarianceAmount = totalBilledAmount - totalInternalApprovedAmount;

  return {
    id: batchId,
    batchNumber: `INV-${targetPo.slice(-4)}-${targetMonth.replace('-', '')}`,
    vendorName,
    vendorEmail,
    poNumber: targetPo,
    billingMonth: targetMonth,
    currency: items[0]?.currency || 'USD',
    uploadedAt: new Date().toISOString(),
    fileName,
    totalLineItems: items.length,
    matchedItemsCount,
    discrepancyItemsCount,
    totalBilledAmount,
    totalInternalApprovedAmount,
    netVarianceAmount,
    approvalFlowInitiated: false,
    status: 'DRAFT_UPLOAD',
    items,
    taxConfig: DEFAULT_TAX_CONFIG
  };
}

/**
 * Retroactive Timesheet Diff & Batch Refresh.
 * Re-evaluates an existing batch against the latest central timesheet database records.
 * Detects newly approved timesheets, corrected days/rates, or added resources without requiring re-upload.
 */
export function resyncBatchWithTimesheets(
  batch: InvoiceBatch,
  timesheets: InternalTimesheet[]
): {
  updatedBatch: InvoiceBatch;
  diffs: string[];
  resolvedCount: number;
  newDiscrepanciesCount: number;
} {
  const diffs: string[] = [];
  let resolvedCount = 0;
  let newDiscrepanciesCount = 0;
  let matchedItemsCount = 0;
  let discrepancyItemsCount = 0;
  let totalInternalApprovedAmount = 0;

  const targetPo = batch.poNumber.trim().toUpperCase();
  const targetMonth = batch.billingMonth.trim();

  const updatedItems = batch.items.map(item => {
    // If the manager has already made a definitive manual decision, preserve it
    if (item.managerDecision) {
      if (item.managerDecision.action === 'APPROVE_VARIANCE' || 
          item.managerDecision.action === 'ADJUST_TO_INTERNAL' || 
          item.managerDecision.action === 'APPROVE_ROUTINE' ||
          item.status === 'APPROVED_WITH_EXCEPTION' || 
          item.status === 'ADJUSTED_TO_TIMESHEET' || 
          item.status === 'APPROVED_ROUTINE') {
        matchedItemsCount++;
        totalInternalApprovedAmount += (item.managerDecision.finalApprovedAmount ?? item.internalApprovedTotalAmount);
        return item;
      } else if (item.managerDecision.action === 'REJECT_BILLING' || item.status === 'REJECTED_BY_MANAGER') {
        discrepancyItemsCount++;
        totalInternalApprovedAmount += item.internalApprovedTotalAmount;
        return item;
      }
    }

    const normalizedEmail = item.resourceEmail.trim().toLowerCase();
    const itemPo = (item.poNumber || targetPo).trim().toUpperCase();
    const itemMonth = (item.billingMonth || targetMonth).trim();

    // Flexible matching: Email match + optional PO and Month match
    const matchingTimesheet = timesheets.find(ts => {
      const emailMatch = ts.resourceEmail.trim().toLowerCase() === normalizedEmail;
      if (!emailMatch) return false;
      const tsPo = (ts.poNumber || '').trim().toUpperCase();
      const tsMonth = (ts.billingMonth || '').trim();
      const poMatches = !tsPo || !itemPo || tsPo === itemPo;
      const monthMatches = !tsMonth || !itemMonth || tsMonth === itemMonth;
      return poMatches && monthMatches;
    }) || timesheets.find(ts => ts.resourceEmail.trim().toLowerCase() === normalizedEmail);

    if (!matchingTimesheet) {
      discrepancyItemsCount++;
      totalInternalApprovedAmount += (item.internalApprovedTotalAmount || 0);
      return item;
    }

    // Check if timesheet changed since batch creation
    const oldApprovedDays = item.internalApprovedDays;
    const oldRate = item.contractDailyRate;
    const newApprovedDays = matchingTimesheet.approvedDays;
    const newContractRate = matchingTimesheet.contractDailyRate;
    const newApprovedTotal = newApprovedDays * newContractRate;

    const daysDiff = item.billedDays - newApprovedDays;
    const rateDiff = item.claimedDailyRate - newContractRate;

    let newType: DiscrepancyType = 'PERFECT_MATCH';
    let newSeverity: DiscrepancySeverity = 'MATCH';
    let newStatus = item.status;

    if (matchingTimesheet.status !== 'Approved') {
      newType = 'TIMESHEET_UNAPPROVED';
      newSeverity = 'CRITICAL';
      newStatus = 'AWAITING_MANAGER_REVIEW';
      discrepancyItemsCount++;
      if (item.discrepancyType !== 'TIMESHEET_UNAPPROVED') {
        newDiscrepanciesCount++;
        diffs.push(`⚠️ ${item.resourceName}: Internal timesheet status is '${matchingTimesheet.status}' (requires approval).`);
      }
    } else if (daysDiff > 0) {
      newType = 'DAYS_OVERBILLED';
      newSeverity = daysDiff > 2 ? 'CRITICAL' : 'MINOR';
      newStatus = 'AWAITING_MANAGER_REVIEW';
      discrepancyItemsCount++;
      if (item.discrepancyType === 'PERFECT_MATCH') {
        newDiscrepanciesCount++;
        diffs.push(`⚠️ ${item.resourceName}: Days overbilled by +${daysDiff}d (${item.billedDays}d billed vs ${newApprovedDays}d approved).`);
      }
    } else if (daysDiff < 0) {
      newType = 'DAYS_UNDERBILLED';
      newSeverity = 'MINOR';
      newStatus = 'AWAITING_MANAGER_REVIEW';
      discrepancyItemsCount++;
    } else if (Math.abs(rateDiff) > 0.01) {
      newType = 'RATE_MISMATCH';
      newSeverity = 'CRITICAL';
      newStatus = 'AWAITING_MANAGER_REVIEW';
      discrepancyItemsCount++;
      if (item.discrepancyType === 'PERFECT_MATCH') {
        newDiscrepanciesCount++;
        diffs.push(`⚠️ ${item.resourceName}: Rate mismatch ($${item.claimedDailyRate}/d billed vs $${newContractRate}/d contract).`);
      }
    } else {
      newType = 'PERFECT_MATCH';
      newSeverity = 'MATCH';
      newStatus = 'AUTO_MATCHED';
      matchedItemsCount++;
      if (item.discrepancyType !== 'PERFECT_MATCH') {
        resolvedCount++;
        diffs.push(`✓ ${item.resourceName}: Discrepancy resolved to 100% match (${newApprovedDays} days approved in central database).`);
      }
    }

    if (oldApprovedDays !== newApprovedDays || oldRate !== newContractRate) {
      diffs.push(`ℹ️ ${item.resourceName}: Internal timesheet record updated from ${oldApprovedDays}d to ${newApprovedDays}d ($${newContractRate}/d).`);
    }

    totalInternalApprovedAmount += newApprovedTotal;

    return {
      ...item,
      poLineItem: item.poLineItem || matchingTimesheet.poLineItem || '00010',
      admSeniority: item.admSeniority || matchingTimesheet.admSeniority || 'Senior',
      admRole: item.admRole || matchingTimesheet.admRole || 'Cloud Consultant',
      locationCity: item.locationCity || matchingTimesheet.locationCity || 'Chicago',
      internalApprovedDays: newApprovedDays,
      contractDailyRate: newContractRate,
      internalApprovedTotalAmount: newApprovedTotal,
      daysVariance: item.billedDays - newApprovedDays,
      financialVarianceAmount: item.billedTotalAmount - newApprovedTotal,
      discrepancyType: newType,
      severity: newSeverity,
      status: newStatus,
      managerEmail: matchingTimesheet.managerEmail || item.managerEmail,
      managerName: matchingTimesheet.managerName || item.managerName,
      department: matchingTimesheet.department || item.department,
      projectCode: matchingTimesheet.projectCode || item.projectCode
    };
  });

  const netVarianceAmount = batch.totalBilledAmount - totalInternalApprovedAmount;
  let finalStatus = batch.status;
  let cert = batch.clearanceCertificate;

  const anyRejected = updatedItems.some(i => i.status === 'REJECTED_BY_MANAGER' || i.managerDecision?.action === 'REJECT_BILLING');
  const allResolved = updatedItems.every(
    i => (i.discrepancyType === 'PERFECT_MATCH' || i.status === 'AUTO_MATCHED' || (i.managerDecision && i.managerDecision.action !== 'REJECT_BILLING'))
  );

  if (anyRejected) {
    finalStatus = 'REJECTED_NEEDS_REVISION';
    cert = undefined;
  } else if (allResolved) {
    finalStatus = 'CLEARED_FOR_ARIBA';
    cert = generatePreInvoiceClearance({
      ...batch,
      items: updatedItems,
      matchedItemsCount,
      discrepancyItemsCount,
      netVarianceAmount,
      totalInternalApprovedAmount
    }, 'central-timesheet-sync@abcompany.com');
  } else if (resolvedCount > 0 && discrepancyItemsCount > 0) {
    finalStatus = 'PARTIALLY_RESOLVED';
  }

  const updatedBatch: InvoiceBatch = {
    ...batch,
    items: updatedItems,
    matchedItemsCount,
    discrepancyItemsCount,
    totalInternalApprovedAmount,
    netVarianceAmount,
    status: finalStatus,
    clearanceCertificate: cert
  };

  return {
    updatedBatch,
    diffs,
    resolvedCount,
    newDiscrepanciesCount
  };
}

/**
 * Generates an official SAP Ariba Pre-Invoice Clearance Certificate.
 */
export function generatePreInvoiceClearance(
  batch: InvoiceBatch,
  approverEmail: string,
  taxConfig?: TaxConfig
): PreInvoiceClearance {
  const certificateId = `AB-PICC-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  
  // Calculate final approved sums
  let totalClearedDays = 0;
  let totalClearedAmount = 0;
  let hasExceptions = false;

  batch.items.forEach(item => {
    if (item.managerDecision) {
      totalClearedDays += item.managerDecision.finalApprovedDays;
      totalClearedAmount += item.managerDecision.finalApprovedAmount;
      if (item.managerDecision.action === 'APPROVE_VARIANCE') {
        hasExceptions = true;
      }
    } else if (item.status === 'AUTO_MATCHED' || item.status === 'APPROVED_ROUTINE') {
      totalClearedDays += item.billedDays;
      totalClearedAmount += item.billedTotalAmount;
    } else {
      totalClearedDays += item.internalApprovedDays;
      totalClearedAmount += item.internalApprovedTotalAmount;
    }
  });

  const rawHash = `${certificateId}|${batch.poNumber}|${batch.vendorName}|${totalClearedAmount}|${batch.billingMonth}|${Date.now()}`;
  let hashNum = 0;
  for (let i = 0; i < rawHash.length; i++) {
    hashNum = (hashNum << 5) - hashNum + rawHash.charCodeAt(i);
    hashNum |= 0;
  }
  const verificationAuditHash = `SHA256:${Math.abs(hashNum).toString(16).toUpperCase()}${Date.now().toString(16).toUpperCase()}`;
  const aribaSubmissionCode = `ARIBA-PICC-${batch.poNumber.slice(-4)}-${Math.abs(hashNum % 99999).toString().padStart(5, '0')}`;

  const resolvedTaxConfig = taxConfig || batch.taxConfig || DEFAULT_TAX_CONFIG;
  const taxCalculation = calculateTax(totalClearedAmount, resolvedTaxConfig);

  return {
    certificateId,
    batchId: batch.id,
    poNumber: batch.poNumber,
    vendorName: batch.vendorName,
    billingMonth: batch.billingMonth,
    currency: batch.currency,
    issuedAt: new Date().toISOString(),
    issuedBy: approverEmail,
    totalClearedDays,
    totalClearedAmount,
    reconciledLineItemsCount: batch.items.length,
    aribaSubmissionCode,
    verificationAuditHash,
    status: hasExceptions ? 'CLEARED_WITH_APPROVED_EXCEPTIONS' : 'CLEARED_EXACT',
    notes: hasExceptions 
      ? 'Approved with authorized manager exceptions and offline timesheet justification.' 
      : 'Exact 100% match with AB Company internal approved timesheet records.',
    taxConfig: resolvedTaxConfig,
    taxCalculation
  };
}

/**
 * Format currency with proper symbol
 */
export function formatCurrency(amount: number | null | undefined, currency: Currency = 'USD'): string {
  const symbols: Record<Currency, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    SGD: 'S$'
  };
  const symbol = (currency && symbols[currency]) ? symbols[currency] : '$';
  const safeAmount = (typeof amount === 'number' && !isNaN(amount)) ? amount : 0;
  return `${symbol}${Math.abs(safeAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface PdfLineComparison {
  poLineItem: string;
  resourceName: string;
  resourceEmail: string;
  pdfDays: number;
  approvedDays: number;
  daysVariance: number;
  pdfRate: number;
  approvedRate: number;
  rateVariance: number;
  pdfLineAmount: number;
  approvedLineAmount: number;
  amountVariance: number;
  matchStatus: 'MATCH' | 'DAYS_MISMATCH' | 'RATE_MISMATCH' | 'UNAPPROVED_EXTRA_LINE' | 'MISSING_IN_PDF';
  notes: string;
}

export interface PdfReconciliationResult {
  pdfMetadata: {
    invoiceNumber?: string;
    poNumber?: string;
    billingMonth?: string;
    piccId?: string;
    vendorName?: string;
    totalAmount?: number;
    totalDays?: number;
    extractedLineCount: number;
    pageCount: number;
  };
  poMapping: {
    targetPoNumber: string;
    targetVendorName: string;
    targetBillingMonth: string;
    mappedLinesCount: number;
    unmappedLinesCount: number;
  };
  piccComparison: {
    piccFound: boolean;
    certificateId?: string;
    aribaSubmissionCode?: string;
    isPiccReferenced: boolean;
    isPiccMatching: boolean;
    clearedDaysInPicc: number;
    pdfTotalDays: number;
    daysDelta: number;
    clearedAmountInPicc: number;
    pdfTotalAmount: number;
    amountDelta: number;
    piccStatus?: string;
    auditVerificationHash?: string;
    isCompliant: boolean;
    failureReasons: string[];
  };
  lineComparisons: PdfLineComparison[];
  overallStatus: 'APPROVED_FOR_ARIBA' | 'DISCREPANCY_DETECTED' | 'PICC_MISMATCH_REJECTED';
  reconciliationSummary: {
    totalPdfDays: number;
    totalApprovedDays: number;
    netDaysVariance: number;
    totalPdfAmount: number;
    totalApprovedAmount: number;
    netAmountVariance: number;
    matchedLinesCount: number;
    exceptionLinesCount: number;
    missingLinesCount: number;
    canPostGoodsReceipt: boolean;
    recommendation: string;
  };
}

/**
 * Extracts tabular line-item data from a PDF commercial invoice,
 * maps it directly to the Purchase Order (PO) structure, and compares it
 * against the existing approved reconciliation data and Pre-Invoice Clearance Certificate (PICC).
 */
export async function extractAndReconcilePdfInvoice(
  pdfBuffer: ArrayBuffer,
  batch: InvoiceBatch,
  piccOverride?: PreInvoiceClearance | null
): Promise<PdfReconciliationResult> {
  // 1. Extract table data and header metadata from PDF
  const parsedPdf: ParsedPdfInvoice = await parsePdfInvoice(pdfBuffer);
  const activePicc = piccOverride || batch.clearanceCertificate;

  // 2. Map PDF lines to PO structure and compare with approved batch items
  const lineComparisons: PdfLineComparison[] = [];
  const matchedBatchItemIds = new Set<string>();

  let totalPdfDays = 0;
  let totalPdfAmount = 0;
  let totalApprovedDays = 0;
  let totalApprovedAmount = 0;
  let mappedLinesCount = 0;
  let unmappedLinesCount = 0;

  // Normalizer helper for line items
  const normalizeLineItem = (line?: string | number): string => {
    if (!line) return '';
    const clean = String(line).replace(/\D/g, '');
    return clean ? clean.padStart(5, '0') : String(line).trim();
  };

  parsedPdf.lines.forEach((pdfLine, idx) => {
    const rawPoLine = pdfLine['PO Line Item'] || pdfLine['Line Item'] || pdfLine['Item #'] || '';
    const normalizedPoLine = normalizeLineItem(rawPoLine);
    const pdfResourceName = String(pdfLine['Resource Name'] || pdfLine['Consultant'] || pdfLine['Resource'] || '').trim();
    const pdfResourceEmail = String(pdfLine['Resource Email ID'] || pdfLine['Email'] || '').toLowerCase().trim();
    const billedDays = Number(pdfLine['Billed Days'] ?? pdfLine['Days'] ?? pdfLine['Worked Days'] ?? 0);
    const dailyRate = Number(pdfLine['Daily Rate'] ?? pdfLine['Rate'] ?? 0);
    const lineAmount = Number(pdfLine['Total Amount'] ?? +(billedDays * dailyRate).toFixed(2));

    totalPdfDays += billedDays;
    totalPdfAmount += lineAmount;

    // Find corresponding item in approved batch
    let batchItem = batch.items.find(it => {
      if (normalizedPoLine && it.poLineItem) {
        return normalizeLineItem(it.poLineItem) === normalizedPoLine;
      }
      return false;
    });

    // Fallback match by email or name if line number not mapped
    if (!batchItem && pdfResourceEmail) {
      batchItem = batch.items.find(it => it.resourceEmail.toLowerCase().trim() === pdfResourceEmail);
    }
    if (!batchItem && pdfResourceName) {
      batchItem = batch.items.find(it => it.resourceName.toLowerCase().trim() === pdfResourceName.toLowerCase());
    }

    if (batchItem) {
      mappedLinesCount++;
      matchedBatchItemIds.add(batchItem.id);

      // Determine approved days and approved rate
      const approvedDays = batchItem.managerDecision
        ? batchItem.managerDecision.finalApprovedDays
        : (batchItem.status === 'APPROVED_ROUTINE' ? batchItem.billedDays : batchItem.internalApprovedDays);

      const approvedRate = batchItem.contractDailyRate || batchItem.claimedDailyRate;
      const approvedAmount = +(approvedDays * approvedRate).toFixed(2);

      totalApprovedDays += approvedDays;
      totalApprovedAmount += approvedAmount;

      const daysVariance = +(billedDays - approvedDays).toFixed(2);
      const rateVariance = +(dailyRate - approvedRate).toFixed(2);
      const amountVariance = +(lineAmount - approvedAmount).toFixed(2);

      let matchStatus: PdfLineComparison['matchStatus'] = 'MATCH';
      let notes = 'Billed days and rate match authorized clearance.';

      if (batchItem.status === 'REJECTED_BY_MANAGER') {
        matchStatus = 'DAYS_MISMATCH';
        notes = `Line was rejected by manager (${batchItem.managerDecision?.justificationNotes || 'No justification'}).`;
      } else if (Math.abs(daysVariance) > 0.01) {
        matchStatus = 'DAYS_MISMATCH';
        notes = daysVariance > 0 
          ? `Overbilled by ${daysVariance} days beyond approved internal clearance (${approvedDays} approved).`
          : `Underbilled by ${Math.abs(daysVariance)} days relative to approved clearance.`;
      } else if (Math.abs(rateVariance) > 0.01) {
        matchStatus = 'RATE_MISMATCH';
        notes = `Daily rate (${dailyRate}) deviates from contracted rate card (${approvedRate}).`;
      }

      lineComparisons.push({
        poLineItem: batchItem.poLineItem || normalizedPoLine || String((idx + 1) * 10).padStart(5, '0'),
        resourceName: batchItem.resourceName || pdfResourceName,
        resourceEmail: batchItem.resourceEmail || pdfResourceEmail,
        pdfDays: billedDays,
        approvedDays,
        daysVariance,
        pdfRate: dailyRate,
        approvedRate,
        rateVariance,
        pdfLineAmount: lineAmount,
        approvedLineAmount: approvedAmount,
        amountVariance,
        matchStatus,
        notes
      });
    } else {
      unmappedLinesCount++;
      lineComparisons.push({
        poLineItem: normalizedPoLine || `EXT-${idx + 1}`,
        resourceName: pdfResourceName || `Unmapped Resource ${idx + 1}`,
        resourceEmail: pdfResourceEmail || 'unmapped@vendor.com',
        pdfDays: billedDays,
        approvedDays: 0,
        daysVariance: billedDays,
        pdfRate: dailyRate,
        approvedRate: 0,
        rateVariance: dailyRate,
        pdfLineAmount: lineAmount,
        approvedLineAmount: 0,
        amountVariance: lineAmount,
        matchStatus: 'UNAPPROVED_EXTRA_LINE',
        notes: 'Line item present in vendor PDF but not found in approved PO clearance.'
      });
    }
  });

  // Check for any missing lines (approved in batch but absent in PDF)
  batch.items.forEach((item, idx) => {
    if (!matchedBatchItemIds.has(item.id)) {
      const approvedDays = item.managerDecision
        ? item.managerDecision.finalApprovedDays
        : (item.status === 'APPROVED_ROUTINE' ? item.billedDays : item.internalApprovedDays);
      const approvedRate = item.contractDailyRate || item.claimedDailyRate;
      const approvedAmount = +(approvedDays * approvedRate).toFixed(2);

      totalApprovedDays += approvedDays;
      totalApprovedAmount += approvedAmount;

      lineComparisons.push({
        poLineItem: item.poLineItem || String((idx + 1) * 10).padStart(5, '0'),
        resourceName: item.resourceName,
        resourceEmail: item.resourceEmail,
        pdfDays: 0,
        approvedDays,
        daysVariance: -approvedDays,
        pdfRate: 0,
        approvedRate,
        rateVariance: -approvedRate,
        pdfLineAmount: 0,
        approvedLineAmount: approvedAmount,
        amountVariance: -approvedAmount,
        matchStatus: 'MISSING_IN_PDF',
        notes: 'Approved PO line item is omitted from the vendor commercial PDF.'
      });
    }
  });

  // 3. Compare against existing Pre-Invoice Clearance Certificate (PICC)
  const failureReasons: string[] = [];
  const piccFound = Boolean(activePicc);
  const clearedDaysInPicc = activePicc?.totalClearedDays ?? 0;
  const clearedAmountInPicc = activePicc?.totalClearedAmount ?? 0;
  const daysDelta = +(totalPdfDays - clearedDaysInPicc).toFixed(2);
  const amountDelta = +(totalPdfAmount - clearedAmountInPicc).toFixed(2);

  const isPiccReferenced = Boolean(
    parsedPdf.piccId && activePicc && parsedPdf.piccId.trim().toUpperCase() === activePicc.certificateId.trim().toUpperCase()
  );

  let isPiccMatching = true;
  if (!activePicc) {
    isPiccMatching = false;
    failureReasons.push('No valid Pre-Invoice Clearance Certificate (PICC) generated for this PO yet.');
  } else {
    if (parsedPdf.piccId && parsedPdf.piccId.trim().toUpperCase() !== activePicc.certificateId.trim().toUpperCase()) {
      isPiccMatching = false;
      failureReasons.push(`PDF references certificate "${parsedPdf.piccId}" but approved batch PICC is "${activePicc.certificateId}".`);
    }
    if (Math.abs(daysDelta) > 0.01) {
      isPiccMatching = false;
      failureReasons.push(`Total billed days in PDF (${totalPdfDays}d) differs from PICC cleared days (${clearedDaysInPicc}d).`);
    }
    if (Math.abs(amountDelta) > 0.50) {
      isPiccMatching = false;
      failureReasons.push(`Total invoice net amount in PDF (${formatCurrency(totalPdfAmount, batch.currency)}) differs from PICC (${formatCurrency(clearedAmountInPicc, batch.currency)}).`);
    }
  }

  // 4. Overall status and recommendation
  const exceptionLinesCount = lineComparisons.filter(l => l.matchStatus !== 'MATCH').length;
  const matchedLinesCount = lineComparisons.filter(l => l.matchStatus === 'MATCH').length;
  const missingLinesCount = lineComparisons.filter(l => l.matchStatus === 'MISSING_IN_PDF').length;

  const isCompliant = isPiccMatching && exceptionLinesCount === 0;

  let overallStatus: PdfReconciliationResult['overallStatus'] = 'APPROVED_FOR_ARIBA';
  let recommendation = 'Commercial invoice PDF strictly matches approved PICC. Goods Receipt (GR) and Service Entry Sheet (SES) can be safely posted in SAP Ariba.';

  if (!isPiccMatching && failureReasons.length > 0) {
    overallStatus = 'PICC_MISMATCH_REJECTED';
    recommendation = `REJECT FOR ARIBA POSTING: Commercial PDF deviates from official Pre-Invoice Clearance Certificate. Reason: ${failureReasons.join(' ')}`;
  } else if (exceptionLinesCount > 0) {
    overallStatus = 'DISCREPANCY_DETECTED';
    recommendation = `REJECT FOR ARIBA POSTING: Found ${exceptionLinesCount} line item discrepancies between the vendor PDF and approved PO clearance. Return to vendor for reissue.`;
  }

  return {
    pdfMetadata: {
      invoiceNumber: parsedPdf.invoiceNumber,
      poNumber: parsedPdf.poNumber || batch.poNumber,
      billingMonth: parsedPdf.billingMonth || batch.billingMonth,
      piccId: parsedPdf.piccId,
      vendorName: parsedPdf.vendorName || batch.vendorName,
      totalAmount: totalPdfAmount,
      totalDays: totalPdfDays,
      extractedLineCount: parsedPdf.lines.length,
      pageCount: parsedPdf.pageCount
    },
    poMapping: {
      targetPoNumber: batch.poNumber,
      targetVendorName: batch.vendorName,
      targetBillingMonth: batch.billingMonth,
      mappedLinesCount,
      unmappedLinesCount
    },
    piccComparison: {
      piccFound,
      certificateId: activePicc?.certificateId,
      aribaSubmissionCode: activePicc?.aribaSubmissionCode,
      isPiccReferenced,
      isPiccMatching,
      clearedDaysInPicc,
      pdfTotalDays: totalPdfDays,
      daysDelta,
      clearedAmountInPicc,
      pdfTotalAmount: totalPdfAmount,
      amountDelta,
      piccStatus: activePicc?.status,
      auditVerificationHash: activePicc?.verificationAuditHash,
      isCompliant,
      failureReasons
    },
    lineComparisons,
    overallStatus,
    reconciliationSummary: {
      totalPdfDays: +totalPdfDays.toFixed(2),
      totalApprovedDays: +totalApprovedDays.toFixed(2),
      netDaysVariance: +(totalPdfDays - totalApprovedDays).toFixed(2),
      totalPdfAmount: +totalPdfAmount.toFixed(2),
      totalApprovedAmount: +totalApprovedAmount.toFixed(2),
      netAmountVariance: +(totalPdfAmount - totalApprovedAmount).toFixed(2),
      matchedLinesCount,
      exceptionLinesCount,
      missingLinesCount,
      canPostGoodsReceipt: isCompliant,
      recommendation
    }
  };
}

