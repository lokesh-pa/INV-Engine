import React, { useState } from 'react';
import { 
  X, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  FileCode, 
  CheckCircle2, 
  ShieldCheck,
  Filter,
  Layers,
  Printer,
  FileCheck
} from 'lucide-react';
import { InvoiceBatch, DiscrepancyItem, Currency, AuditLogEntry, UserProfile } from '../types';
import { 
  exportReconciliationReportToExcel, 
  exportToCSV, 
  exportToJSON 
} from '../utils/excelHelper';
import { formatCurrency } from '../utils/reconciliationEngine';
import { downloadBatchAuditPdfReport } from '../utils/pdfReportGenerator';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  batches: InvoiceBatch[];
  currentBatch?: InvoiceBatch | null;
  currentCurrency: Currency;
  auditLogs?: AuditLogEntry[];
  currentUser: UserProfile;
  onOpenPdfReport?: (batch: InvoiceBatch) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  batches,
  currentBatch,
  currentCurrency,
  auditLogs = [],
  currentUser,
  onOpenPdfReport
}) => {
  const [exportFormat, setExportFormat] = useState<'EXCEL' | 'CSV' | 'JSON' | 'PDF'>('EXCEL');
  const [exportScope, setExportScope] = useState<'CURRENT_BATCH' | 'ALL_BATCHES' | 'DISCREPANCIES_ONLY' | 'APPROVED_ONLY'>('CURRENT_BATCH');
  const [includeAuditTrail, setIncludeAuditTrail] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  // Determine items based on scope
  const targetBatch = currentBatch || batches[0] || null;
  let itemsToExport: DiscrepancyItem[] = [];

  if (exportScope === 'CURRENT_BATCH' && targetBatch) {
    itemsToExport = targetBatch.items;
  } else if (exportScope === 'ALL_BATCHES') {
    batches.forEach(b => itemsToExport.push(...b.items));
  } else if (exportScope === 'DISCREPANCIES_ONLY') {
    const pool = exportScope === 'CURRENT_BATCH' && targetBatch ? targetBatch.items : batches.flatMap(b => b.items);
    itemsToExport = pool.filter(i => i.discrepancyType !== 'PERFECT_MATCH');
  } else if (exportScope === 'APPROVED_ONLY') {
    const pool = exportScope === 'CURRENT_BATCH' && targetBatch ? targetBatch.items : batches.flatMap(b => b.items);
    itemsToExport = pool.filter(i => i.status === 'APPROVED_ROUTINE' || i.status === 'APPROVED_WITH_EXCEPTION' || i.status === 'ADJUSTED_TO_TIMESHEET');
  }

  const handleExecuteExport = () => {
    setIsExporting(true);
    const poNum = targetBatch?.poNumber || 'ALL_POS';

    setTimeout(() => {
      try {
        if (exportFormat === 'PDF' && targetBatch) {
          downloadBatchAuditPdfReport(
            targetBatch,
            targetBatch.clearanceCertificate,
            includeAuditTrail ? auditLogs : [],
            currentUser,
            currentCurrency
          );
        } else if (exportFormat === 'EXCEL') {
          exportReconciliationReportToExcel(
            itemsToExport,
            poNum,
            targetBatch ? {
              vendorName: targetBatch.vendorName,
              billingMonth: targetBatch.billingMonth,
              totalBilledAmount: targetBatch.totalBilledAmount,
              totalInternalApprovedAmount: targetBatch.totalInternalApprovedAmount,
              netVarianceAmount: targetBatch.netVarianceAmount,
              status: targetBatch.status,
              clearanceCertificate: targetBatch.clearanceCertificate
            } : undefined,
            includeAuditTrail ? auditLogs : undefined
          );
        } else if (exportFormat === 'CSV') {
          const csvRows = itemsToExport.map(i => ({
            'Discrepancy ID': i.id,
            'PO Number': i.poNumber,
            'Vendor': i.vendorName,
            'Billing Month': i.billingMonth,
            'Resource Email': i.resourceEmail,
            'Resource Name': i.resourceName,
            'Billed Days': i.billedDays,
            'Internal Approved Days': i.internalApprovedDays,
            'Days Variance': i.daysVariance,
            'Claimed Rate': i.claimedDailyRate,
            'Contract Rate': i.contractDailyRate,
            'Billed Total': i.billedTotalAmount,
            'Internal Approved Total': i.internalApprovedTotalAmount,
            'Financial Variance': i.financialVarianceAmount,
            'Currency': i.currency,
            'Status': i.status,
            'Review Manager': i.managerName,
            'Manager Action': i.managerDecision?.action || 'PENDING',
            'Delegated Sign-off': i.managerDecision?.delegatedBy ? i.managerDecision.delegatedBy.delegatorName : 'NO',
            'Justification': i.managerDecision?.justificationNotes || ''
          }));
          exportToCSV(csvRows, `Reconciliation_Ledger_${poNum}`);
        } else if (exportFormat === 'JSON') {
          const exportPayload = {
            exportMetadata: {
              exportedAt: new Date().toISOString(),
              exportedBy: currentUser.email,
              actorRole: currentUser.role,
              scope: exportScope,
              itemsCount: itemsToExport.length
            },
            batchSummary: targetBatch,
            reconciledItems: itemsToExport,
            auditTrail: includeAuditTrail ? auditLogs : undefined
          };
          exportToJSON(exportPayload, `Reconciliation_Audit_${poNum}`);
        }

        setExportSuccess(true);
        setTimeout(() => {
          setExportSuccess(false);
          setIsExporting(false);
          onClose();
        }, 1200);
      } catch (err) {
        console.error('Export error', err);
        setIsExporting(false);
      }
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Export Reconciliation Data</h2>
              <p className="text-xs text-slate-300">
                Generate formatted reports, audit logs, and ERP ledgers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          
          {/* Format Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              1. Choose Export File Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              
              {/* PDF Audit Report */}
              <div 
                id="export-format-pdf"
                onClick={() => setExportFormat('PDF')}
                className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                  exportFormat === 'PDF'
                    ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <FileCheck className={`w-6 h-6 mx-auto mb-1.5 ${exportFormat === 'PDF' ? 'text-blue-600' : 'text-slate-400'}`} />
                <p className="text-xs font-bold text-slate-800">PDF Report</p>
                <p className="text-[10px] text-slate-500">.pdf (Audit & PICC)</p>
              </div>

              {/* Excel */}
              <div 
                id="export-format-excel"
                onClick={() => setExportFormat('EXCEL')}
                className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                  exportFormat === 'EXCEL'
                    ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <FileSpreadsheet className={`w-6 h-6 mx-auto mb-1.5 ${exportFormat === 'EXCEL' ? 'text-blue-600' : 'text-slate-400'}`} />
                <p className="text-xs font-bold text-slate-800">Excel Package</p>
                <p className="text-[10px] text-slate-500">.xlsx (Multi-Sheet)</p>
              </div>

              {/* CSV */}
              <div 
                id="export-format-csv"
                onClick={() => setExportFormat('CSV')}
                className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                  exportFormat === 'CSV'
                    ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <FileText className={`w-6 h-6 mx-auto mb-1.5 ${exportFormat === 'CSV' ? 'text-blue-600' : 'text-slate-400'}`} />
                <p className="text-xs font-bold text-slate-800">ERP Flat CSV</p>
                <p className="text-[10px] text-slate-500">.csv (SAP / Oracle)</p>
              </div>

              {/* JSON */}
              <div 
                id="export-format-json"
                onClick={() => setExportFormat('JSON')}
                className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                  exportFormat === 'JSON'
                    ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <FileCode className={`w-6 h-6 mx-auto mb-1.5 ${exportFormat === 'JSON' ? 'text-blue-600' : 'text-slate-400'}`} />
                <p className="text-xs font-bold text-slate-800">Audit JSON</p>
                <p className="text-[10px] text-slate-500">.json (API / Hash)</p>
              </div>

            </div>
          </div>

          {/* Scope Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              2. Data Scope & Filter
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer text-xs border border-slate-200 transition-colors">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === 'CURRENT_BATCH'}
                  onChange={() => setExportScope('CURRENT_BATCH')}
                  className="text-blue-600"
                />
                <div className="flex-1">
                  <span className="font-semibold text-slate-800">Active Batch ({targetBatch?.poNumber || 'PO-AB-2026-8941'})</span>
                  <span className="block text-[10px] text-slate-500">Includes all {targetBatch?.totalLineItems || 0} line items for {targetBatch?.vendorName}</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer text-xs border border-slate-200 transition-colors">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === 'ALL_BATCHES'}
                  onChange={() => setExportScope('ALL_BATCHES')}
                  className="text-blue-600"
                />
                <div className="flex-1">
                  <span className="font-semibold text-slate-800">All Batches & Purchase Orders</span>
                  <span className="block text-[10px] text-slate-500">Full central repository across all vendors</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer text-xs border border-slate-200 transition-colors">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === 'DISCREPANCIES_ONLY'}
                  onChange={() => setExportScope('DISCREPANCIES_ONLY')}
                  className="text-blue-600"
                />
                <div className="flex-1">
                  <span className="font-semibold text-slate-800">Discrepancies & Exceptions Only</span>
                  <span className="block text-[10px] text-slate-500">Only rows with days or rate variances requiring review</span>
                </div>
              </label>
            </div>
          </div>

          {/* Include Audit Trail */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={includeAuditTrail}
                onChange={(e) => setIncludeAuditTrail(e.target.checked)}
                className="w-4 h-4 rounded-sm text-blue-600"
              />
              <span className="text-slate-700 font-medium">
                Include complete system audit trail & delegation history in report
              </span>
            </label>
          </div>

          {/* Export Summary Box */}
          <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500">Ready to export:</span>
              <strong className="text-blue-900 ml-1.5">{itemsToExport.length} Line Items</strong>
              {exportFormat === 'PDF' && (
                <span className="ml-2 text-emerald-700 font-semibold">• Includes SAP Ariba PICC Attestation</span>
              )}
            </div>
            <div className="text-right">
              <span className="text-slate-500">Format:</span>
              <strong className="text-blue-900 ml-1.5">
                {exportFormat === 'PDF' ? '.pdf (Printable Report)' : `.${exportFormat.toLowerCase()}`}
              </strong>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Audit Compliant Export</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
            >
              Cancel
            </button>

            {exportFormat === 'PDF' && targetBatch && onOpenPdfReport && (
              <button
                type="button"
                id="modal-open-pdf-preview-btn"
                onClick={() => {
                  onClose();
                  onOpenPdfReport(targetBatch);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Open Print Preview</span>
              </button>
            )}

            <button
              id="modal-download-export-btn"
              onClick={handleExecuteExport}
              disabled={isExporting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-2"
            >
              {exportSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Downloaded Successfully!</span>
                </>
              ) : isExporting ? (
                <span>Generating Export...</span>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{exportFormat === 'PDF' ? 'Download Offline Report' : 'Download Export'}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
