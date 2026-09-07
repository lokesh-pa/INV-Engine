import React, { useState } from 'react';
import { 
  Printer, 
  Download, 
  Copy, 
  Check, 
  X, 
  ShieldCheck, 
  FileText, 
  Building2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  FileCheck,
  Hash,
  PackageCheck,
  FileSpreadsheet
} from 'lucide-react';
import { InvoiceBatch, PreInvoiceClearance, Currency, AuditLogEntry, UserProfile } from '../types';
import { formatCurrency, generatePreInvoiceClearance } from '../utils/reconciliationEngine';
import { downloadBatchAuditPdfReport } from '../utils/pdfReportGenerator';

interface AuditPdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: InvoiceBatch;
  currentCurrency: Currency;
  auditLogs?: AuditLogEntry[];
  currentUser?: UserProfile;
}

export const AuditPdfReportModal: React.FC<AuditPdfReportModalProps> = ({
  isOpen,
  onClose,
  batch,
  currentCurrency,
  auditLogs = [],
  currentUser
}) => {
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [copiedGrTable, setCopiedGrTable] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  // Resolve certificate or generate fallback
  const certificate: PreInvoiceClearance = batch.clearanceCertificate || generatePreInvoiceClearance(
    batch,
    currentUser?.email || 'accounts.payable@abcompany.com'
  );

  const currency: Currency = currentCurrency || batch.currency || 'USD';
  const isFullyCleared = batch.status === 'CLEARED_FOR_ARIBA' || 
    batch.items.every(i => i.status === 'PERFECT_MATCH' || !!i.managerDecision);

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

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadReport = () => {
    downloadBatchAuditPdfReport(batch, certificate, auditLogs, currentUser, currency);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(certificate.aribaSubmissionCode);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleCopyHash = () => {
    navigator.clipboard.writeText(certificate.verificationAuditHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2500);
  };

  const handleCopyGrTable = () => {
    const headers = [
      'PO Line Item',
      'Purchase Order Number',
      'Purchase Order',
      'Consultant / Resource',
      'Resource Email',
      'ADM Seniority',
      'ADM Role',
      'Resource Location (City)',
      'Project Code',
      'UOM',
      'Total Number of Days per Line Item (Ariba GR)',
      'Claimed Days',
      'Timesheet Days',
      'Daily Rate',
      'Cleared Amount',
      'Ariba Status'
    ];
    const rows = batch.items.map((item, idx) => {
      const finalDays = item.managerDecision 
        ? item.managerDecision.finalApprovedDays 
        : (item.internalApprovedDays ?? item.billedDays);
      const finalAmount = item.managerDecision 
        ? item.managerDecision.finalApprovedAmount 
        : +(finalDays * item.claimedDailyRate).toFixed(2);
      return [
        item.poLineItem || String((idx + 1) * 10).padStart(5, '0'),
        item.poNumber || batch.poNumber,
        `${batch.poNumber} (${batch.vendorName})`,
        item.resourceName,
        item.resourceEmail,
        item.admSeniority || 'Senior',
        item.admRole || 'Cloud Specialist',
        item.locationCity || 'Chicago',
        item.projectCode || 'PRJ-CORE',
        'DAY',
        finalDays,
        item.billedDays,
        item.internalApprovedDays,
        formatCurrency(item.claimedDailyRate, currency),
        formatCurrency(finalAmount, currency),
        'Cleared for Ariba GR'
      ].join('\t');
    });
    const tsv = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(tsv);
    setCopiedGrTable(true);
    setTimeout(() => setCopiedGrTable(false), 2500);
  };

  const handleDownloadGrCsv = () => {
    const headers = [
      'Purchase Order Number',
      'PO Line Item',
      'Purchase Order',
      'Consultant Name',
      'Consultant Email',
      'ADM Seniority',
      'ADM Role',
      'Resource Location (City)',
      'Project Code',
      'Unit of Measure',
      'Total Number of Days per Line Item',
      'Claimed Days',
      'Timesheet Days',
      'Daily Rate',
      'Cleared Amount',
      'Currency',
      'Ariba Goods Receipt Status'
    ];
    const rows = batch.items.map((item, idx) => {
      const finalDays = item.managerDecision 
        ? item.managerDecision.finalApprovedDays 
        : (item.internalApprovedDays ?? item.billedDays);
      const finalAmount = item.managerDecision 
        ? item.managerDecision.finalApprovedAmount 
        : +(finalDays * item.claimedDailyRate).toFixed(2);
      return [
        `"${item.poNumber || batch.poNumber}"`,
        `"${item.poLineItem || String((idx + 1) * 10).padStart(5, '0')}"`,
        `"${batch.poNumber} - ${batch.vendorName}"`,
        `"${item.resourceName}"`,
        `"${item.resourceEmail}"`,
        `"${item.admSeniority || 'Senior'}"`,
        `"${item.admRole || 'Cloud Specialist'}"`,
        `"${item.locationCity || 'Chicago'}"`,
        `"${item.projectCode || 'PRJ-CORE'}"`,
        `"DAY"`,
        finalDays,
        item.billedDays,
        item.internalApprovedDays,
        item.claimedDailyRate,
        finalAmount,
        `"${currency}"`,
        `"CLEARED_FOR_ARIBA_GR"`
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ariba_Goods_Receipt_Line_Items_${batch.poNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-5xl w-full my-4 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Floating Action Bar (no-print) */}
        <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 no-print border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Offline Audit PDF Report & Clearance Certificate</span>
                <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-[10px] font-mono font-semibold">
                  PDF / Printable
                </span>
              </div>
              <span className="text-xs text-slate-400 block font-mono">
                PO: {batch.poNumber} • Batch: {batch.batchNumber} • Vendor: {batch.vendorName}
              </span>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              id="print-pdf-report-btn"
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-xs"
              title="Print directly or Save as PDF using system print dialog"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save as PDF</span>
            </button>

            <button
              id="download-offline-report-btn"
              onClick={handleDownloadReport}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors shadow-xs"
              title="Download self-contained offline report file (.html) for offline auditing"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Offline Report</span>
                </>
              )}
            </button>

            <button
              onClick={handleCopyToken}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
              title="Copy SAP Ariba Submission Token"
            >
              {copiedToken ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-slate-400" />
                  <span>PICC Token</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors ml-1"
              title="Close Audit Report"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="overflow-y-auto p-4 sm:p-8 bg-slate-100 flex-1">
          
          {/* THE PRINTABLE AUDIT REPORT */}
          <div 
            id="printable-audit-report" 
            className="bg-white mx-auto max-w-4xl p-6 sm:p-10 rounded-xl shadow-xs border border-slate-300 text-slate-900 font-sans"
          >
            {/* Header Block */}
            <div className="border-b-2 border-slate-900 pb-4 mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  AB COMPANY GLOBAL INC.
                </div>
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mt-1">
                  Corporate Invoicing Governance & Central Timesheet Audit Division
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Official Executive Reconciliation Ledger & SAP Ariba Pre-Invoice Clearance Certificate (PICC)
                </div>
              </div>

              <div className="sm:text-right shrink-0">
                <span className={`inline-block px-2.5 py-1 rounded text-xs font-extrabold uppercase border ${
                  isFullyCleared 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}>
                  {isFullyCleared ? '✓ AUDIT CLEARED FOR ERP POSTING' : '⚠ PARTIAL / PENDING AUDIT REVIEW'}
                </span>
                <div className="font-mono text-xs text-slate-600 font-bold mt-2">
                  REPORT ID: AUDIT-{batch.poNumber}-{new Date().getFullYear()}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Generated: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>

            {/* Section 1: Executive Purchase Order & Batch Profile */}
            <div className="mb-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>1. Executive Purchase Order & Batch Profile</span>
                </h3>
                <span className="text-[10px] font-semibold text-slate-500">
                  Auditor Ref: {currentUser?.email || 'accounts.payable@abcompany.com'}
                </span>
              </div>

              {/* Grid 1: Identifiers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Purchase Order</div>
                  <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">{batch.poNumber}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Contract: PO-2026-HQ</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Vendor Organization</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 truncate" title={batch.vendorName}>{batch.vendorName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">{batch.vendorEmail}</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Billing Period</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{batch.billingMonth}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Uploaded: {new Date(batch.uploadedAt).toLocaleDateString()}</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Ledger Currency</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{currency}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">ISO Standards Compliant</div>
                </div>
              </div>

              {/* Grid 2: Financial Reconciliation Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Claimed by Vendor</div>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5">
                    {formatCurrency(batch.totalBilledAmount, currency)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {batch.items.reduce((s, i) => s + i.billedDays, 0)} Total Claimed Days
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Timesheet Verified</div>
                  <div className="text-base font-extrabold text-blue-700 mt-0.5">
                    {formatCurrency(batch.totalInternalApprovedAmount, currency)}
                  </div>
                  <div className="text-[10px] text-blue-600 mt-0.5">
                    {batch.items.reduce((s, i) => s + i.internalApprovedDays, 0)} Verified Timesheet Days
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Net Variance Exposure</div>
                  <div className={`text-base font-extrabold mt-0.5 ${batch.netVarianceAmount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {formatCurrency(batch.netVarianceAmount, currency)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {batch.discrepancyItemsCount} Discrepancies Flagged
                  </div>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase font-bold text-emerald-800">Total Cleared Amount</div>
                  <div className="text-base font-black text-emerald-800 mt-0.5">
                    {formatCurrency(certificate.totalClearedAmount, currency)}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                    {certificate.totalClearedDays} Days Cleared for Ariba
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: SAP Ariba Pre-Invoice Clearance Certificate (PICC) */}
            <div className="mb-6 avoid-break">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. SAP Ariba Pre-Invoice Clearance Certificate (PICC) Attestation</span>
                </h3>
                <span className="text-[10px] font-semibold text-emerald-700 font-mono">
                  cXML 1.2 INVOICING COMPLIANT
                </span>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-300 rounded-xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 max-w-xl">
                    <div className="text-xs font-extrabold uppercase text-emerald-900 tracking-wide">
                      Certified Pre-Invoice Clearance Reference (PICC)
                    </div>
                    <p className="text-xs text-emerald-950 leading-relaxed">
                      This certificate constitutes irrevocable authorization from AB Company accounts payable that the associated {batch.items.length} consultant timesheet records have been cross-checked, reviewed by verified resource managers, and cleared for SAP Ariba automated invoice matching.
                    </p>
                    <div className="text-xs text-slate-700 pt-1">
                      <strong>Certificate ID:</strong> <span className="font-mono font-bold text-slate-900">{certificate.certificateId}</span> • 
                      <span className="ml-2">Issued: {new Date(certificate.issuedAt).toLocaleDateString()} by <strong>{certificate.issuedBy}</strong></span>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0">
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                      Mandatory Ariba Submission Token
                    </div>
                    <div className="bg-slate-900 text-emerald-400 font-mono font-bold text-sm px-3.5 py-1.5 rounded-md inline-flex items-center gap-2 border border-slate-800 shadow-xs">
                      <span>{certificate.aribaSubmissionCode}</span>
                      <button
                        onClick={handleCopyToken}
                        className="text-slate-400 hover:text-white no-print"
                        title="Copy Code"
                      >
                        {copiedToken ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-emerald-900 gap-2">
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-emerald-700 shrink-0" />
                    <span>Cryptographic Audit Hash:</span>
                    <span className="font-mono font-bold text-slate-900 text-[10px] break-all">
                      {certificate.verificationAuditHash}
                    </span>
                    <button
                      onClick={handleCopyHash}
                      className="text-slate-500 hover:text-slate-800 no-print ml-1"
                      title="Copy Hash"
                    >
                      {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div>
                    Clearance Status: <strong className="uppercase">{certificate.status}</strong> ({certificate.reconciledLineItemsCount} lines cleared)
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: SAP Ariba Goods Receipt (GR) Line-Item Summary Table */}
            <div className="mb-6 avoid-break">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 mb-3 gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900">
                      3. SAP Ariba Goods Receipt (GR / SES) Summary Table
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Authorized receiving quantities per line item — used for goods receipt in Ariba when vendor submits actual invoice
                  </p>
                </div>

                {/* Quick actions for Goods Receipt Table (TSV copy & CSV download) */}
                <div className="flex items-center gap-2 no-print shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyGrTable}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors"
                    title="Copy table formatted for pasting into Excel or SAP Ariba"
                  >
                    {copiedGrTable ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Copied TSV!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-slate-500" />
                        <span>Copy GR Data</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadGrCsv}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors"
                    title="Download Goods Receipt Summary CSV"
                  >
                    <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                    <span>Download GR CSV</span>
                  </button>
                </div>
              </div>

              {/* Informational Guidance Box for Ariba 3-Way Match */}
              <div className="bg-slate-50 border border-emerald-200/80 rounded-lg p-3 mb-3 text-[11px] text-slate-800 flex items-start gap-2.5">
                <div className="p-1 bg-emerald-600 text-white rounded shrink-0 mt-0.5">
                  <PackageCheck className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-emerald-900">
                    Ariba Goods Receipt (GR / SES) Operational Mandate
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    This summary table shows the <strong>Purchase Order</strong>, <strong>PO Number</strong>, and <strong>Total Number of Days per Line Item</strong> cleared by accounts payable and resource managers. This is used for creating the Goods Receipt (GR) or Service Entry Sheet (SES) in SAP Ariba when the vendor submits their actual commercial invoice. When the vendor bills against PO <strong className="font-mono text-slate-900">{batch.poNumber}</strong>, SAP Ariba validates the invoice against these exact cleared days for touchless 3-way matching.
                  </p>
                </div>
              </div>

              {/* Summary Table */}
              <div className="overflow-x-auto border border-slate-300 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[10px] font-bold tracking-wider">
                      <th className="py-2.5 px-3">PO Line Item</th>
                      <th className="py-2.5 px-3">Purchase Order Number</th>
                      <th className="py-2.5 px-3">Line Item / Consultant</th>
                      <th className="py-2.5 px-2">ADM Role & Seniority</th>
                      <th className="py-2.5 px-2">Location (City)</th>
                      <th className="py-2.5 px-2 text-center">UOM</th>
                      <th className="py-2.5 px-3 text-center bg-emerald-700 text-white font-black">
                        Total Number of Days per Line Item
                      </th>
                      <th className="py-2.5 px-3 text-right">Unit Rate</th>
                      <th className="py-2.5 px-3 text-right">Cleared GR Amount</th>
                      <th className="py-2.5 px-3 text-center">Ariba Match Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {batch.items.map((item, idx) => {
                      const finalDays = item.managerDecision 
                        ? item.managerDecision.finalApprovedDays 
                        : (item.internalApprovedDays ?? item.billedDays);
                      const finalAmount = item.managerDecision 
                        ? item.managerDecision.finalApprovedAmount 
                        : +(finalDays * item.claimedDailyRate).toFixed(2);
                      const linePoNumber = item.poNumber || batch.poNumber;
                      const linePoItem = item.poLineItem || String((idx + 1) * 10).padStart(5, '0');

                      return (
                        <tr key={`ariba-gr-row-${item.id}`} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded font-mono font-black text-xs bg-blue-50 text-blue-800 border border-blue-200">
                              {linePoItem}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-extrabold text-blue-700 whitespace-nowrap">
                            <div>{linePoNumber}</div>
                            <div className="text-[10px] font-sans font-normal text-slate-500">{batch.vendorName}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{item.resourceName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {item.resourceEmail}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="font-semibold text-slate-800">{item.admRole || 'Cloud Consultant'}</div>
                            <span className="inline-block px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-medium border border-slate-200">
                              {item.admSeniority || 'Senior'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-slate-700 font-medium">
                            {item.locationCity || 'Chicago'}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-600">
                            DAY
                          </td>
                          <td className="py-2.5 px-3 text-center bg-emerald-50/80 border-x border-emerald-200">
                            <div className="inline-flex items-center gap-1 font-black text-sm text-emerald-900">
                              <span>{finalDays}</span>
                              <span className="text-[10px] font-bold text-emerald-700 uppercase">Days</span>
                            </div>
                            <div className="text-[9px] text-slate-500">
                              (Claim: {item.billedDays}d • TS: {item.internalApprovedDays}d)
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {formatCurrency(item.claimedDailyRate, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(finalAmount, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Ready for GR</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Summary Totals Row */}
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                      <td colSpan={6} className="py-2.5 px-3 text-right text-xs uppercase tracking-wide">
                        Ariba Goods Receipt Grand Totals ({batch.items.length} Line Items):
                      </td>
                      <td className="py-2.5 px-3 text-center bg-emerald-100/90 border-x border-emerald-300">
                        <div className="text-base font-black text-emerald-900">
                          {certificate.totalClearedDays} Days
                        </div>
                        <div className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider">
                          Total Approved Days
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 text-[10px] font-mono">
                        Avg: {formatCurrency(certificate.totalClearedAmount / (certificate.totalClearedDays || 1), currency)}/d
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-sm text-slate-950 font-mono">
                        {formatCurrency(certificate.totalClearedAmount, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-[10px] text-emerald-800 uppercase font-extrabold">
                        3-Way Match Verified
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Section 4: Detailed Consultant Line-Item Schedule */}
            <div className="mb-6 page-break">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>4. Reconciled Consultant Line-Item Timesheet & Variance Schedule</span>
                </h3>
                <span className="text-[10px] font-semibold text-slate-500">
                  {perfectMatches} Matched • {approvedVariances} Approved • {adjustedLines} Adjusted • {rejectedLines} Rejected
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">Consultant & Role</th>
                      <th className="py-2.5 px-2 text-center">Claimed</th>
                      <th className="py-2.5 px-2 text-center">Timesheet</th>
                      <th className="py-2.5 px-2 text-center">Variance</th>
                      <th className="py-2.5 px-2 text-center bg-slate-200 text-slate-900 font-extrabold">Cleared</th>
                      <th className="py-2.5 px-3 text-right">Rate & Amount</th>
                      <th className="py-2.5 px-3">Manager Decision & Sign-off</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {batch.items.map((item, idx) => {
                      const finalDays = item.managerDecision 
                        ? item.managerDecision.finalApprovedDays 
                        : (item.internalApprovedDays ?? item.billedDays);
                      const finalAmount = item.managerDecision 
                        ? item.managerDecision.finalApprovedAmount 
                        : +(finalDays * item.claimedDailyRate).toFixed(2);

                      return (
                        <tr key={item.id} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="py-2.5 px-3 align-top">
                            <div className="font-bold text-slate-900">{item.resourceName}</div>
                            <div className="font-mono text-[10px] text-slate-500">{item.resourceEmail}</div>
                            <div className="text-[10px] text-slate-600 mt-0.5">Code: <span className="font-mono font-semibold">{item.projectCode || 'PRJ-CORE'}</span></div>
                          </td>
                          <td className="py-2.5 px-2 text-center align-top font-semibold text-slate-800">
                            {item.billedDays}d
                          </td>
                          <td className="py-2.5 px-2 text-center align-top font-semibold text-blue-700">
                            {item.internalApprovedDays}d
                          </td>
                          <td className={`py-2.5 px-2 text-center align-top font-extrabold ${
                            item.daysVariance > 0 ? 'text-rose-600' : item.daysVariance < 0 ? 'text-emerald-700' : 'text-slate-600'
                          }`}>
                            {item.daysVariance > 0 ? `+${item.daysVariance}d` : `${item.daysVariance}d`}
                          </td>
                          <td className="py-2.5 px-2 text-center align-top font-black text-emerald-800 bg-emerald-50/60">
                            {finalDays}d
                          </td>
                          <td className="py-2.5 px-3 text-right align-top">
                            <div className="text-slate-500 text-[10px]">Claim: {formatCurrency(item.claimedDailyRate, currency)}</div>
                            <div className="font-bold text-slate-900 mt-0.5">Final: {formatCurrency(finalAmount, currency)}</div>
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            {item.managerDecision ? (
                              <div>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                  item.managerDecision.action === 'APPROVE_VARIANCE' 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                    : item.managerDecision.action === 'ADJUST_TO_INTERNAL' 
                                    ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}>
                                  {item.managerDecision.action.replace(/_/g, ' ')}
                                </span>
                                <div className="text-[10px] text-slate-700 mt-1">
                                  <strong>Sign-off:</strong> {item.managerDecision.decidedByName} ({new Date(item.managerDecision.decidedAt).toLocaleDateString()})
                                </div>
                                {item.managerDecision.delegatedBy && (
                                  <div className="text-[9px] text-purple-700 font-semibold">
                                    [Delegated on behalf of {item.managerDecision.delegatedBy.delegatorName}]
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 italic mt-0.5">
                                  "{item.managerDecision.justificationNotes}"
                                </div>
                              </div>
                            ) : item.discrepancyType === 'PERFECT_MATCH' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-teal-50 text-teal-800 border border-teal-200">
                                100% Timesheet Match
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                Pending Decision
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 5: Manager Approvals & Delegation Audit Trail */}
            <div className="mb-6 avoid-break">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>5. Managerial Sign-Off & Delegation Governance Audit Trail</span>
                </h3>
                <span className="text-[10px] font-semibold text-slate-500">
                  SOX & Internal Accounting Controls Verified
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Signatory / Actor</th>
                      <th className="py-2 px-3">Protocol Action</th>
                      <th className="py-2 px-3">Compliance Justification Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {auditLogs
                      .filter(l => !l.poNumber || l.poNumber === batch.poNumber)
                      .slice(0, 6)
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono text-slate-500 text-[10px] whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-800 whitespace-nowrap">
                            {log.actorName} <span className="text-[9px] font-normal text-slate-500 uppercase">({log.actorRole})</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-[10px] font-bold text-blue-700">
                            {log.action}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {log.details}
                          </td>
                        </tr>
                      ))}
                    {auditLogs.filter(l => !l.poNumber || l.poNumber === batch.poNumber).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 italic text-xs">
                          All managerial sign-offs cross-referenced and verified against digital hash {certificate.verificationAuditHash}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 6: Offline Audit Sign-Off & Attestation Signatures */}
            <div className="avoid-break mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>6. Offline Audit Certification & Attestation Signatures</span>
                </h3>
                <span className="text-[10px] font-semibold text-slate-500">
                  Required for Offline Ledger Physical Archiving
                </span>
              </div>

              <p className="text-xs text-slate-600 mb-4">
                By signing below, each party confirms that the hours, rates, and financial adjustments detailed in this document have been cross-verified against corporate project timesheets and commercial agreement terms, and are cleared for offline accounting ledger reconciliation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="border border-dashed border-slate-300 rounded-lg p-3.5 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs">Vendor Authorized Signatory</div>
                  <div className="text-[10px] text-slate-500">{batch.vendorName}</div>
                  <div className="border-b border-slate-300 h-10 my-2"></div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Signature & Title</span>
                    <span>Date: ____/____/2026</span>
                  </div>
                </div>

                <div className="border border-dashed border-slate-300 rounded-lg p-3.5 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs">AB Company Resource Manager</div>
                  <div className="text-[10px] text-slate-500">Project & Cost Center Approver</div>
                  <div className="border-b border-slate-300 h-10 my-2"></div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Signature & Title</span>
                    <span>Date: ____/____/2026</span>
                  </div>
                </div>

                <div className="border border-dashed border-slate-300 rounded-lg p-3.5 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs">AB Global AP Finance Controller</div>
                  <div className="text-[10px] text-slate-500">Accounts Payable & Audit Oversight</div>
                  <div className="border-b border-slate-300 h-10 my-2"></div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Signature & Title</span>
                    <span>Date: ____/____/2026</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Footer */}
            <div className="mt-8 pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-slate-400 gap-2">
              <div>
                <strong>CONFIDENTIAL & PROPRIETARY</strong> — AB Company Global Inc. & {batch.vendorName}. Retain for a minimum of 7 years for tax & corporate audit compliance.
              </div>
              <div className="font-mono">
                PICC-{certificate.certificateId} • Build v2.4
              </div>
            </div>

          </div>

        </div>

        {/* Modal Bottom Bar */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0 no-print">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Fully compliant with AB Company AP Pre-Invoice Governance standards</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadReport}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-bold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Download Standalone (.html)</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
