import { InvoiceBatch, DiscrepancyItem, ActualInvoiceLine, AribaGrValidationResult } from '../types';

/**
 * Flexible column key finder for vendor invoice format variations
 */
function findKeyValue(row: Record<string, any>, possibleKeys: string[]): any {
  const rowKeys = Object.keys(row);
  for (const candidate of possibleKeys) {
    const foundKey = rowKeys.find(
      k => k.trim().toLowerCase() === candidate.toLowerCase() || 
           k.trim().toLowerCase().includes(candidate.toLowerCase())
    );
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
      return row[foundKey];
    }
  }
  return undefined;
}

/**
 * Validate a vendor's commercial invoice against the Manager-Approved Pre-Invoice Clearance
 * Primary Focus:
 * 1. Number of Days for each line item (PRIMARY MATCH)
 * 2. Daily Rate
 * 3. Taxes are explicitly excluded (Pre-Tax basis only)
 * 4. Amounts are indicative only
 */
export function validateInvoiceAgainstClearance(
  clearedBatch: InvoiceBatch,
  rawInvoiceRows: Record<string, any>[],
  validatorUser: { name: string; email: string }
): AribaGrValidationResult {
  const cert = clearedBatch.clearanceCertificate;
  const approvedItems = clearedBatch.items;

  const lineResults: ActualInvoiceLine[] = [];
  let mismatchedLinesCount = 0;
  let matchedLinesCount = 0;

  let totalActualInvoiceDays = 0;
  let totalActualInvoicePreTaxAmount = 0;

  rawInvoiceRows.forEach((row, index) => {
    // 1. Flexible Resource Email extraction
    const rawEmail = findKeyValue(row, [
      'resource email', 'resource email id', 'email id', 'email', 'consultant email', 'contractor email'
    ]);
    const resourceEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : undefined;

    // 2. Flexible Resource Name extraction
    const rawName = findKeyValue(row, [
      'resource name', 'consultant name', 'contractor name', 'employee name', 'name', 'resource', 'consultant'
    ]);
    const resourceName = rawName ? String(rawName).trim() : undefined;

    // 3. Flexible PO Line extraction
    const poLine = findKeyValue(row, ['po line item', 'po line', 'line item', 'line', 'item']);

    // 4. Flexible Billed Days extraction (handles "Days", "Quantity", "Worked Days", "Units")
    const rawDays = findKeyValue(row, [
      'billed days', 'number of days', 'days billed', 'worked days', 'days', 'quantity', 'qty', 'units', 'total days'
    ]);
    let billedDays = parseFloat(String(rawDays || 0).replace(/[^0-9.-]/g, ''));
    if (isNaN(billedDays)) billedDays = 0;

    // 5. Flexible Daily Rate extraction (handles "Daily Rate", "Rate", "Unit Price", "Price")
    const rawRate = findKeyValue(row, [
      'daily rate', 'rate/day', 'day rate', 'rate', 'unit price', 'unit cost', 'price', 'contract rate'
    ]);
    let dailyRate = parseFloat(String(rawRate || 0).replace(/[^0-9.-]/g, ''));
    if (isNaN(dailyRate)) dailyRate = 0;

    // 6. Taxes (Detected for logging/informational only, EXCLUDED from pre-tax matching)
    const rawTaxVal = findKeyValue(row, ['vat', 'gst', 'tax', 'tax amount', 'sales tax', 'tax %']);
    const rawTaxAmount = rawTaxVal ? parseFloat(String(rawTaxVal).replace(/[^0-9.-]/g, '')) : undefined;

    // Pre-Tax Amount = Days * Daily Rate
    const preTaxAmount = billedDays * dailyRate;
    totalActualInvoiceDays += billedDays;
    totalActualInvoicePreTaxAmount += preTaxAmount;

    // Match against approved line items
    let matchedItem: DiscrepancyItem | undefined = undefined;

    if (resourceEmail) {
      matchedItem = approvedItems.find(item => item.resourceEmail.toLowerCase() === resourceEmail);
    }

    if (!matchedItem && resourceName) {
      const cleanName = resourceName.toLowerCase();
      matchedItem = approvedItems.find(item => 
        item.resourceName.toLowerCase() === cleanName ||
        item.resourceName.toLowerCase().includes(cleanName) ||
        cleanName.includes(item.resourceName.toLowerCase())
      );
    }

    if (!matchedItem && poLine) {
      matchedItem = approvedItems.find(item => item.poLineItem === String(poLine).padStart(5, '0'));
    }

    // Fallback: match by position if length matches
    if (!matchedItem && approvedItems[index]) {
      matchedItem = approvedItems[index];
    }

    if (!matchedItem) {
      mismatchedLinesCount++;
      lineResults.push({
        lineIndex: index + 1,
        resourceEmail,
        resourceName: resourceName || `Unidentified Line #${index + 1}`,
        poNumber: clearedBatch.poNumber,
        poLineItem: poLine ? String(poLine) : undefined,
        billedDays,
        dailyRate,
        preTaxAmount,
        rawTaxAmount,
        dayMatchStatus: 'UNMATCHED',
        rateMatchStatus: 'UNMATCHED',
        dayDifference: billedDays,
        rateDifference: dailyRate,
        statusNote: 'Line item not found in Manager Approved Pre-Invoice Clearance certificate.'
      });
      return;
    }

    // Baseline approved figures
    const approvedDays = matchedItem.managerDecision?.finalApprovedDays ?? matchedItem.billedDays;
    const approvedRate = matchedItem.contractDailyRate;

    const dayDiff = Number((billedDays - approvedDays).toFixed(2));
    const rateDiff = Number((dailyRate - approvedRate).toFixed(2));

    const dayPass = Math.abs(dayDiff) < 0.001;
    const ratePass = Math.abs(rateDiff) < 0.01;

    if (dayPass && ratePass) {
      matchedLinesCount++;
    } else {
      mismatchedLinesCount++;
    }

    let statusNote = 'Line approved: Days and Daily Rate match clearance certificate.';
    if (!dayPass && !ratePass) {
      statusNote = `MISMATCH: Billed days (${billedDays}d vs approved ${approvedDays}d) AND Daily rate (${dailyRate} vs contract ${approvedRate}) diverge from managerial approval.`;
    } else if (!dayPass) {
      statusNote = `DAY MISMATCH: Vendor invoice bills ${billedDays} days vs ${approvedDays} days approved by manager (${dayDiff > 0 ? '+' : ''}${dayDiff} days variance).`;
    } else if (!ratePass) {
      statusNote = `RATE MISMATCH: Vendor billed rate ${dailyRate} differs from approved contract rate ${approvedRate}.`;
    }

    lineResults.push({
      lineIndex: index + 1,
      resourceEmail: matchedItem.resourceEmail,
      resourceName: matchedItem.resourceName,
      poNumber: clearedBatch.poNumber,
      poLineItem: matchedItem.poLineItem,
      billedDays,
      dailyRate,
      preTaxAmount,
      rawTaxAmount,
      matchedApprovedItem: matchedItem,
      dayMatchStatus: dayPass ? 'MATCH' : 'MISMATCH',
      rateMatchStatus: ratePass ? 'MATCH' : 'MISMATCH',
      dayDifference: dayDiff,
      rateDifference: rateDiff,
      statusNote
    });
  });

  const totalApprovedDays = cert?.totalClearedDays ?? approvedItems.reduce(
    (acc, i) => acc + (i.managerDecision?.finalApprovedDays ?? i.billedDays), 0
  );
  const totalApprovedPreTaxAmount = cert?.totalClearedAmount ?? approvedItems.reduce(
    (acc, i) => acc + (i.managerDecision?.finalApprovedAmount ?? i.billedTotalAmount), 0
  );

  const daysDifference = Number((totalActualInvoiceDays - totalApprovedDays).toFixed(2));
  const financialDifference = Number((totalActualInvoicePreTaxAmount - totalApprovedPreTaxAmount).toFixed(2));

  // Binary Decision: Go-Ahead vs Do Not Proceed
  // Primary Match: number of days must match exactly, daily rate must match contract
  const allLinesPassed = mismatchedLinesCount === 0 && lineResults.length === approvedItems.length && Math.abs(daysDifference) < 0.001;
  const decision: 'PROCEED_WITH_GR' | 'DO_NOT_PROCEED_MISMATCH' = allLinesPassed
    ? 'PROCEED_WITH_GR'
    : 'DO_NOT_PROCEED_MISMATCH';

  const summaryMessage = allLinesPassed
    ? `GO-AHEAD CONFIRMED FOR SAP ARIBA GOODS RECEIPT (GR). All ${lineResults.length} line items exhibit exact alignment with manager-approved days (${totalApprovedDays} days) and contract daily rates. Zero variances detected.`
    : `DO NOT PROCEED WITH GOODS RECEIPT (GR) IN SAP ARIBA. Discrepancies detected across ${mismatchedLinesCount} line item(s). Primary day mismatch: ${daysDifference > 0 ? '+' : ''}${daysDifference} days variance against approved certificate.`;

  return {
    validationId: `VAL-GR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    validatedAt: new Date().toISOString(),
    validatedByEmail: validatorUser.email,
    validatedByName: validatorUser.name,
    certificateId: cert?.certificateId || 'PENDING-CERT',
    poNumber: clearedBatch.poNumber,
    vendorName: clearedBatch.vendorName,
    billingMonth: clearedBatch.billingMonth,
    currency: clearedBatch.currency,
    decision,
    totalApprovedDays,
    totalActualInvoiceDays,
    daysDifference,
    totalApprovedPreTaxAmount,
    totalActualInvoicePreTaxAmount,
    financialDifference,
    linesValidatedCount: lineResults.length,
    mismatchedLinesCount,
    matchedLinesCount,
    lineResults,
    summaryMessage,
    taxNote: 'Note: In accordance with procurement reconciliation policy, taxes (VAT/GST) are excluded from this validation. Validation is performed strictly on pre-tax billed days and daily rates. Amounts displayed are indicative.'
  };
}
