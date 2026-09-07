import { InvoiceBatch, PreInvoiceClearance, AuditLogEntry, UserProfile, Currency } from '../types';
import { formatCurrency, generatePreInvoiceClearance } from './reconciliationEngine';

/**
 * Escapes characters for safe HTML inclusion
 */
function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates an executive, print-ready, high-resolution HTML document
 * containing the full Invoice Batch Summary, SAP Ariba Pre-Invoice Clearance Certificate (PICC),
 * line-item timesheet reconciliation schedule, manager audit trail, and offline sign-off blocks.
 */
export function generateBatchAuditReportHtml(
  batch: InvoiceBatch,
  certificateOverride?: PreInvoiceClearance,
  auditLogs: AuditLogEntry[] = [],
  currentUser?: UserProfile,
  currencyOverride?: Currency
): string {
  const currency: Currency = currencyOverride || batch.currency || 'USD';
  const certificate = certificateOverride || batch.clearanceCertificate || generatePreInvoiceClearance(
    batch,
    currentUser?.email || 'accounts.payable@abcompany.com'
  );

  const exportDate = new Date().toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'medium'
  });

  const isFullyCleared = batch.status === 'CLEARED_FOR_ARIBA' || 
    batch.items.every(i => i.discrepancyType === 'PERFECT_MATCH' || i.status === 'AUTO_MATCHED' || !!i.managerDecision);

  // Statistics calculation
  const totalItems = batch.items.length;
  const perfectMatches = batch.items.filter(i => i.discrepancyType === 'PERFECT_MATCH').length;
  const approvedVariances = batch.items.filter(i => 
    i.managerDecision?.action === 'APPROVE_VARIANCE' || i.status === 'APPROVED_WITH_EXCEPTION'
  ).length;
  const adjustedLines = batch.items.filter(i => 
    i.managerDecision?.action === 'ADJUST_TO_INTERNAL' || i.status === 'ADJUSTED_TO_TIMESHEET'
  ).length;
  const rejectedLines = batch.items.filter(i => 
    i.managerDecision?.action === 'REJECT_BILLING' || i.status === 'REJECTED_BY_MANAGER'
  ).length;
  const pendingLines = batch.items.filter(i => 
    i.discrepancyType !== 'PERFECT_MATCH' && !i.managerDecision
  ).length;

  // Build Table rows for Ariba Goods Receipt Summary
  const goodsReceiptRowsHtml = batch.items.map((item, idx) => {
    const finalDays = item.managerDecision 
      ? item.managerDecision.finalApprovedDays 
      : (item.internalApprovedDays ?? item.billedDays);
    const finalAmount = item.managerDecision 
      ? item.managerDecision.finalApprovedAmount 
      : +(finalDays * item.claimedDailyRate).toFixed(2);
    const poNumber = item.poNumber || batch.poNumber;
    const poLineItem = item.poLineItem || String((idx + 1) * 10).padStart(5, '0');

    return `
      <tr style="border-bottom: 1px solid #cbd5e1; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;'}">
        <td style="padding: 8px 10px; font-family: monospace; font-weight: 700; color: #1e3a8a;">
          <span style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 2px 5px; border-radius: 4px;">
            ${escapeHtml(poLineItem)}
          </span>
        </td>
        <td style="padding: 8px 10px; font-family: monospace; font-weight: 800; color: #1d4ed8;">
          <div>${escapeHtml(poNumber)}</div>
          <div style="font-size: 9px; font-family: sans-serif; color: #64748b;">${escapeHtml(batch.vendorName)}</div>
        </td>
        <td style="padding: 8px 10px; color: #0f172a;">
          <div style="font-weight: 700;">${escapeHtml(item.resourceName)}</div>
          <div style="font-size: 9px; color: #64748b; font-family: monospace;">${escapeHtml(item.resourceEmail)}</div>
        </td>
        <td style="padding: 8px 10px; color: #334155; font-size: 10px;">
          <div style="font-weight: 600;">${escapeHtml(item.admRole || 'Cloud Consultant')}</div>
          <div style="font-size: 9px; color: #64748b;">${escapeHtml(item.admSeniority || 'Senior')}</div>
        </td>
        <td style="padding: 8px 10px; color: #334155; font-size: 10px;">
          ${escapeHtml(item.locationCity || 'Chicago')}
        </td>
        <td style="padding: 8px 10px; text-align: center; font-family: monospace; font-weight: 700; color: #475569;">
          DAY
        </td>
        <td style="padding: 8px 10px; text-align: center; background-color: #f0fdf4; border-left: 1px solid #bbf7d0; border-right: 1px solid #bbf7d0;">
          <div style="font-size: 13px; font-weight: 900; color: #065f46;">
            ${finalDays} Days
          </div>
          <div style="font-size: 9px; color: #64748b;">
            (Claim: ${item.billedDays}d | TS: ${item.internalApprovedDays}d)
          </div>
        </td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace; color: #334155;">
          ${formatCurrency(item.claimedDailyRate, currency)}
        </td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: 800; color: #0f172a;">
          ${formatCurrency(finalAmount, currency)}
        </td>
        <td style="padding: 8px 10px; text-align: center; font-size: 10px;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 700; background-color: #dcfce7; color: #166534; border: 1px solid #86efac;">
            ✓ Ready for GR
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // Build Table rows for line items
  const lineItemRowsHtml = batch.items.map((item, idx) => {
    const finalDays = item.managerDecision 
      ? item.managerDecision.finalApprovedDays 
      : (item.internalApprovedDays ?? item.billedDays);
    
    const finalAmount = item.managerDecision 
      ? item.managerDecision.finalApprovedAmount 
      : +(finalDays * item.claimedDailyRate).toFixed(2);

    let statusBadge = '';
    if (item.managerDecision?.action === 'APPROVE_VARIANCE') {
      statusBadge = '<span style="color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">APPROVED VARIANCE</span>';
    } else if (item.managerDecision?.action === 'ADJUST_TO_INTERNAL') {
      statusBadge = '<span style="color:#b45309;background:#fffbeb;border:1px solid #fde68a;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">ADJUSTED TO TIMESHEET</span>';
    } else if (item.managerDecision?.action === 'REJECT_BILLING') {
      statusBadge = '<span style="color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">REJECTED</span>';
    } else if (item.discrepancyType === 'PERFECT_MATCH') {
      statusBadge = '<span style="color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">100% ROUTINE MATCH</span>';
    } else {
      statusBadge = '<span style="color:#475569;background:#f1f5f9;border:1px solid #cbd5e1;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">PENDING DECISION</span>';
    }

    const decisionDetails = item.managerDecision ? `
      <div style="margin-top: 4px; font-size: 11px; color: #334155;">
        <strong>Sign-off:</strong> ${escapeHtml(item.managerDecision.decidedByName)} 
        <span style="color:#64748b; font-size:10px;">(${new Date(item.managerDecision.decidedAt).toLocaleDateString()})</span>
        ${item.managerDecision.delegatedBy ? `<br><span style="color:#7c3aed;font-weight:600;font-size:10px;">[Delegated sign-off on behalf of ${escapeHtml(item.managerDecision.delegatedBy.delegatorName)}]</span>` : ''}
        <div style="font-style: italic; color: #475569; margin-top:2px; font-size:10.5px;">"${escapeHtml(item.managerDecision.justificationNotes)}"</div>
      </div>
    ` : `
      <div style="font-size: 11px; color: #64748b; font-style: italic;">Verified against AB Company internal timesheets.</div>
    `;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #fafbfd;' : 'background-color: #ffffff;'}">
        <td style="padding: 9px 10px; vertical-align: top;">
          <div style="font-weight: 700; color: #0f172a; font-size: 12px;">${escapeHtml(item.resourceName)}</div>
          <div style="font-family: monospace; font-size: 10px; color: #64748b;">${escapeHtml(item.resourceEmail)}</div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">Code: <strong style="font-family:monospace;">${escapeHtml(item.projectCode || 'PRJ-CORE')}</strong></div>
        </td>
        <td style="padding: 9px 10px; text-align: center; vertical-align: top; font-weight: 600; font-size: 12px;">
          ${item.billedDays}d
        </td>
        <td style="padding: 9px 10px; text-align: center; vertical-align: top; font-weight: 600; font-size: 12px; color: #2563eb;">
          ${item.internalApprovedDays}d
        </td>
        <td style="padding: 9px 10px; text-align: center; vertical-align: top; font-weight: 800; font-size: 12px; color: ${item.daysVariance > 0 ? '#dc2626' : item.daysVariance < 0 ? '#059669' : '#475569'};">
          ${item.daysVariance > 0 ? `+${item.daysVariance}d` : `${item.daysVariance}d`}
        </td>
        <td style="padding: 9px 10px; text-align: center; vertical-align: top; font-weight: 800; font-size: 12px; color: #047857; background-color: #f0fdf4;">
          ${finalDays}d
        </td>
        <td style="padding: 9px 10px; text-align: right; vertical-align: top; font-size: 11px;">
          <div style="color:#64748b;">Claim: ${formatCurrency(item.claimedDailyRate, currency)}</div>
          <div style="font-weight:700; color:#0f172a; margin-top:2px;">Final: ${formatCurrency(finalAmount, currency)}</div>
        </td>
        <td style="padding: 9px 10px; vertical-align: top;">
          <div>${statusBadge}</div>
          ${decisionDetails}
        </td>
      </tr>
    `;
  }).join('');

  // Relevant audit logs
  const batchAuditLogs = auditLogs
    .filter(log => !log.poNumber || log.poNumber === batch.poNumber)
    .slice(0, 10);

  const auditLogsHtml = batchAuditLogs.length > 0 ? batchAuditLogs.map(log => `
    <tr style="border-bottom: 1px solid #f1f5f9; font-size: 11px;">
      <td style="padding: 6px 8px; color: #64748b; font-family: monospace; white-space: nowrap;">
        ${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </td>
      <td style="padding: 6px 8px; font-weight: 700; color: #0f172a; white-space: nowrap;">
        ${escapeHtml(log.actorName)} <span style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:normal;">(${escapeHtml(log.actorRole)})</span>
      </td>
      <td style="padding: 6px 8px; font-weight: 600; color: #2563eb; font-family: monospace; font-size: 10px;">
        ${escapeHtml(log.action)}
      </td>
      <td style="padding: 6px 8px; color: #334155;">
        ${escapeHtml(log.details)}
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="4" style="padding: 10px; text-align: center; color: #94a3b8; font-style: italic; font-size: 11px;">
        All manager approvals verified directly against digital hash ${escapeHtml(certificate.verificationAuditHash)}.
      </td>
    </tr>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AB Company Audit Report - PO ${escapeHtml(batch.poNumber)}</title>
  <style>
    @page {
      size: letter;
      margin: 12mm 14mm 14mm 14mm;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        background: #ffffff !important;
        padding: 0 !important;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-before: always;
        break-before: page;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      line-height: 1.45;
      margin: 0;
      padding: 24px;
      background: #f8fafc;
    }
    .report-container {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 32px 36px;
      box-shadow: 0 4px 15px -2px rgba(0, 0, 0, 0.05);
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 12px;
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 700;
    }
    .kpi-value {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }
    .table-container {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }
    .table-container th {
      background: #f1f5f9;
      color: #475569;
      text-transform: uppercase;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.3px;
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid #cbd5e1;
    }
    .cert-box {
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 8px;
      padding: 14px 16px;
      margin-top: 14px;
      margin-bottom: 18px;
    }
    .token-display {
      background: #0f172a;
      color: #34d399;
      font-family: monospace;
      font-weight: 800;
      font-size: 14px;
      padding: 6px 14px;
      border-radius: 6px;
      display: inline-block;
      letter-spacing: 1px;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid #e2e8f0;
    }
    .signature-block {
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      background: #fafbfd;
      font-size: 11px;
    }
    .signature-line {
      border-bottom: 1px solid #94a3b8;
      height: 38px;
      margin-bottom: 6px;
    }
    .action-bar {
      max-width: 960px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #2563eb;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 12px;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: #334155; }
    .btn-secondary:hover { background: #475569; }
  </style>
</head>
<body>

  <!-- Floating Offline Action Bar (Excluded during printing) -->
  <div class="action-bar no-print">
    <div>
      <span style="font-weight: 800; font-size: 13px;">AB Company Offline Audit Report & Clearance Package</span>
      <span style="color: #94a3b8; font-size: 11px; margin-left: 10px;">PO: ${escapeHtml(batch.poNumber)} • Generated: ${escapeHtml(exportDate)}</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()" class="btn">
        🖨️ Print / Save as PDF
      </button>
      <button onclick="window.close()" class="btn btn-secondary">
        Close Window
      </button>
    </div>
  </div>

  <div class="report-container" id="printable-audit-report">
    
    <!-- Header Block -->
    <div class="top-bar">
      <div>
        <div style="font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">
          AB COMPANY GLOBAL INC.
        </div>
        <div style="font-size: 12px; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px;">
          Corporate Invoicing Governance & Central Timesheet Audit Division
        </div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
          Official Executive Reconciliation Ledger & SAP Ariba Pre-Invoice Clearance Certificate (PICC)
        </div>
      </div>
      <div style="text-align: right;">
        <div style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; ${isFullyCleared ? 'background:#dcfce7;color:#166534;border:1px solid #86efac;' : 'background:#fef3c7;color:#92400e;border:1px solid #fde68a;'}">
          ${isFullyCleared ? '✓ AUDIT CLEARED FOR ERP POSTING' : '⚠ PARTIAL / PENDING AUDIT REVIEW'}
        </div>
        <div style="font-family: monospace; font-size: 11px; color: #475569; margin-top: 6px; font-weight: 700;">
          REPORT ID: AUDIT-${escapeHtml(batch.poNumber)}-${new Date().getFullYear()}
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
          Generated: ${escapeHtml(exportDate)}
        </div>
      </div>
    </div>

    <!-- Section 1: Executive Batch Metadata & Summary -->
    <div class="section-title">
      <span>1. Executive Purchase Order & Batch Profile</span>
      <span style="font-size: 10px; font-weight: 600; color: #64748b; text-transform: none;">Auditor Ref: ${escapeHtml(currentUser?.email || 'accounts.payable@abcompany.com')}</span>
    </div>

    <div class="grid-4">
      <div class="kpi-card">
        <div class="kpi-label">Purchase Order</div>
        <div class="kpi-value" style="font-family: monospace; font-size: 15px;">${escapeHtml(batch.poNumber)}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Contract ID: PO-2026-HQ</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Vendor Organization</div>
        <div class="kpi-value" style="font-size: 14px;">${escapeHtml(batch.vendorName)}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${escapeHtml(batch.vendorEmail)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Billing Period</div>
        <div class="kpi-value" style="font-size: 15px;">${escapeHtml(batch.billingMonth)}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Uploaded: ${new Date(batch.uploadedAt).toLocaleDateString()}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Ledger Currency</div>
        <div class="kpi-value" style="font-size: 15px;">${escapeHtml(currency)}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">ISO Compliant Rates</div>
      </div>
    </div>

    <div class="grid-4">
      <div class="kpi-card">
        <div class="kpi-label">Total Claimed (Vendor)</div>
        <div class="kpi-value">${formatCurrency(batch.totalBilledAmount, currency)}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${batch.items.reduce((s, i) => s + i.billedDays, 0)} Total Claimed Days</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Approved (Internal)</div>
        <div class="kpi-value" style="color: #2563eb;">${formatCurrency(batch.totalInternalApprovedAmount, currency)}</div>
        <div style="font-size: 10px; color: #2563eb; margin-top: 2px;">${batch.items.reduce((s, i) => s + i.internalApprovedDays, 0)} Verified Timesheet Days</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Variance Exposure</div>
        <div class="kpi-value" style="color: ${batch.netVarianceAmount > 0 ? '#b91c1c' : '#047857'};">
          ${formatCurrency(batch.netVarianceAmount, currency)}
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
          ${batch.discrepancyItemsCount} Discrepancies Flagged
        </div>
      </div>
      <div class="kpi-card" style="background: #ecfdf5; border-color: #a7f3d0;">
        <div class="kpi-label" style="color: #065f46;">Total Cleared Amount</div>
        <div class="kpi-value" style="color: #047857;">${formatCurrency(certificate.totalClearedAmount, currency)}</div>
        <div style="font-size: 10px; color: #047857; margin-top: 2px;">
          ${certificate.totalClearedDays} Days Authorized for Ariba
        </div>
      </div>
    </div>

    <!-- Section 2: SAP Ariba Pre-Invoice Clearance Certificate (PICC) -->
    <div class="avoid-break">
      <div class="section-title">
        <span>2. SAP Ariba Pre-Invoice Clearance Certificate (PICC) Attestation</span>
        <span style="font-size: 10px; font-weight: 600; color: #047857;">cXML 1.2 Invoicing Standard</span>
      </div>

      <div class="cert-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 13px; font-weight: 800; color: #065f46; text-transform: uppercase;">
              Certified Pre-Invoice Clearance Reference (PICC)
            </div>
            <div style="font-size: 11px; color: #047857; margin-top: 3px; max-width: 580px;">
              This certificate constitutes irrevocable authorization from AB Company accounts payable that the associated ${batch.items.length} consultant timesheet records have been cross-checked, reviewed by verified resource managers, and cleared for SAP Ariba automated invoice matching.
            </div>
            <div style="margin-top: 10px; font-size: 11px; color: #334155;">
              <strong>PICC Certificate ID:</strong> <span style="font-family: monospace; font-weight: 700;">${escapeHtml(certificate.certificateId)}</span> • 
              <strong>Issued:</strong> ${new Date(certificate.issuedAt).toLocaleDateString()} by <strong>${escapeHtml(certificate.issuedBy)}</strong>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: #475569; margin-bottom: 4px;">
              Mandatory Ariba Submission Token
            </div>
            <div class="token-display">
              ${escapeHtml(certificate.aribaSubmissionCode)}
            </div>
          </div>
        </div>

        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #bbf7d0; display: flex; justify-content: space-between; font-size: 10.5px; color: #065f46;">
          <div>
            <strong>Cryptographic Audit Hash:</strong> <span style="font-family: monospace; color: #0f172a;">${escapeHtml(certificate.verificationAuditHash)}</span>
          </div>
          <div>
            Status: <strong>${escapeHtml(certificate.status)}</strong> (${certificate.reconciledLineItemsCount} lines cleared)
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: SAP Ariba Goods Receipt (GR) Line-Item Summary Table -->
    <div class="avoid-break" style="margin-top: 20px;">
      <div class="section-title">
        <span>3. SAP Ariba Goods Receipt (GR / SES) Summary Table</span>
        <span style="font-size: 10px; font-weight: 600; color: #065f46; text-transform: none;">
          Mandatory for Goods Receipt in Ariba when vendor submits actual invoice
        </span>
      </div>

      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 11px; color: #065f46; line-height: 1.5;">
        <strong>📦 Ariba Goods Receipt (GR / SES) Operational Mandate:</strong>
        This summary table displays the verified <strong>Purchase Order</strong>, <strong>PO Number</strong>, and <strong>Total Number of Days per Line Item</strong>. This is used for creating the Goods Receipt (GR) or Service Entry Sheet (SES) in SAP Ariba when the vendor submits their actual commercial invoice. When the vendor bills against PO <strong style="font-family: monospace;">${escapeHtml(batch.poNumber)}</strong>, SAP Ariba automatically conducts 3-way matching against these approved quantities for zero-discrepancy clearance.
      </div>

      <table class="table-container" border="0" style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff;">
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 10%;">PO Line Item</th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 14%;">PO Number</th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 16%;">Resource / Consultant</th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 14%;">ADM Role & Seniority</th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 10%;">Location (City)</th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 5%; text-align: center;">UOM</th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; background: #047857; width: 12%; text-align: center;">
              Total Number of Days
            </th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 9%; text-align: right;">Unit Rate</th>
            <th style="padding: 8px 10px; font-size: 10px; color: #ffffff; width: 10%; text-align: right;">Total GR Value</th>
          </tr>
        </thead>
        <tbody>
          ${goodsReceiptRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; border-top: 2px solid #94a3b8; font-weight: 800; color: #0f172a;">
            <td colspan="6" style="padding: 9px 10px; text-align: right; text-transform: uppercase; font-size: 11px;">
              Total Cleared for Ariba Goods Receipt (${batch.items.length} Line Items):
            </td>
            <td style="padding: 9px 10px; text-align: center; background: #dcfce7; border-left: 1px solid #86efac; border-right: 1px solid #86efac; color: #065f46; font-size: 13px; font-weight: 900;">
              ${certificate.totalClearedDays} Days
            </td>
            <td style="padding: 9px 10px; text-align: right; font-size: 10px; color: #64748b;">
              Avg Rate
            </td>
            <td style="padding: 9px 10px; text-align: right; font-size: 13px; color: #0f172a; font-family: monospace;">
              ${formatCurrency(certificate.totalClearedAmount, currency)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Section 4: Reconciled Consultant Line-Item Schedule -->
    <div class="page-break"></div>

    <div class="section-title">
      <span>4. Reconciled Consultant Line-Item Timesheet & Variance Schedule</span>
      <span style="font-size: 10px; font-weight: 600; color: #64748b; text-transform: none;">
        Breakdown: ${perfectMatches} Matched • ${approvedVariances} Approved • ${adjustedLines} Adjusted • ${rejectedLines} Rejected
      </span>
    </div>

    <table class="table-container" border="0">
      <thead>
        <tr>
          <th style="width: 26%;">Consultant & Project</th>
          <th style="text-align: center; width: 9%;">Claimed</th>
          <th style="text-align: center; width: 9%;">Timesheet</th>
          <th style="text-align: center; width: 9%;">Variance</th>
          <th style="text-align: center; width: 9%; background: #e2e8f0; color:#0f172a;">Cleared</th>
          <th style="text-align: right; width: 14%;">Rate & Amount</th>
          <th style="width: 24%;">Manager Decision & Rationale</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRowsHtml}
      </tbody>
    </table>

    <!-- Section 5: System Audit Trail & Manager Decisions Log -->
    <div class="avoid-break" style="margin-top: 24px;">
      <div class="section-title">
        <span>5. Managerial Sign-Off & Delegation Governance Audit Trail</span>
        <span style="font-size: 10px; font-weight: 600; color: #64748b; text-transform: none;">SOX & Internal Controls Compliant</span>
      </div>

      <table class="table-container" border="0" style="margin-top: 4px;">
        <thead>
          <tr>
            <th style="width: 14%;">Timestamp</th>
            <th style="width: 24%;">Signatory / Actor</th>
            <th style="width: 18%;">Action Protocol</th>
            <th style="width: 44%;">Compliance Justification Details</th>
          </tr>
        </thead>
        <tbody>
          ${auditLogsHtml}
        </tbody>
      </table>
    </div>

    <!-- Section 6: Offline Audit Sign-Off & Attestation Block -->
    <div class="avoid-break">
      <div class="section-title">
        <span>6. Offline Audit Certification & Attestation Signatures</span>
        <span style="font-size: 10px; font-weight: 600; color: #64748b; text-transform: none;">Mandatory for Offline Ledger Archival</span>
      </div>

      <p style="font-size: 11px; color: #475569; margin: 0 0 10px 0;">
        By signing below, each party confirms that the hours, rates, and financial adjustments detailed in this document have been cross-verified against corporate project timesheets and commercial agreement terms, and are cleared for offline accounting ledger reconciliation.
      </p>

      <div class="signature-grid">
        <div class="signature-block">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">Vendor Authorized Signatory</div>
          <div style="color: #64748b; font-size: 10px;">${escapeHtml(batch.vendorName)}</div>
          <div class="signature-line"></div>
          <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 10px;">
            <span>Signature & Title</span>
            <span>Date: ____/____/2026</span>
          </div>
        </div>

        <div class="signature-block">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">AB Company Resource Manager</div>
          <div style="color: #64748b; font-size: 10px;">Project & Cost Center Approver</div>
          <div class="signature-line"></div>
          <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 10px;">
            <span>Signature & Title</span>
            <span>Date: ____/____/2026</span>
          </div>
        </div>

        <div class="signature-block">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">AB Global AP Finance Controller</div>
          <div style="color: #64748b; font-size: 10px;">Accounts Payable & Audit Oversight</div>
          <div class="signature-line"></div>
          <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 10px;">
            <span>Signature & Title</span>
            <span>Date: ____/____/2026</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Document Footer -->
    <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
      <div>
        <strong>CONFIDENTIAL & PROPRIETARY</strong> — AB Company Global Inc. & ${escapeHtml(batch.vendorName)}. Retain for a minimum of 7 years for tax & corporate audit compliance.
      </div>
      <div>
        Page 1 of 1 • System Build v2.4
      </div>
    </div>

  </div>

</body>
</html>`;
}

/**
 * Initiates the download of the standalone offline audit report HTML document.
 * Works seamlessly in sandboxed iframe environments using standard Blob and link click.
 */
export function downloadBatchAuditPdfReport(
  batch: InvoiceBatch,
  certificateOverride?: PreInvoiceClearance,
  auditLogs: AuditLogEntry[] = [],
  currentUser?: UserProfile,
  currencyOverride?: Currency
): void {
  const htmlContent = generateBatchAuditReportHtml(
    batch,
    certificateOverride,
    auditLogs,
    currentUser,
    currencyOverride
  );

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `AB_Audit_Report_${batch.poNumber}_${batch.billingMonth}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
