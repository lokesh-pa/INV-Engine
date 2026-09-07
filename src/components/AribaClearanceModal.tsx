import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Printer, 
  Copy, 
  Check, 
  ShieldCheck, 
  X, 
  Code2, 
  BookOpen, 
  CheckCircle2, 
  FileCode, 
  Sparkles,
  Percent,
  SlidersHorizontal,
  Layers,
  PackageCheck,
  FileSpreadsheet
} from 'lucide-react';
import { InvoiceBatch, Currency, PreInvoiceClearance, TaxConfig } from '../types';
import { 
  formatCurrency, 
  generatePreInvoiceClearance, 
  calculateTax,
  DEFAULT_TAX_CONFIG 
} from '../utils/reconciliationEngine';
import { 
  generateAribaCxml, 
  generateServiceEntrySheetCxml,
  downloadCxmlFile, 
  downloadCertificateDocument 
} from '../utils/cxmlGenerator';

interface AribaClearanceModalProps {
  batch: InvoiceBatch;
  currentCurrency: Currency;
  onClose: () => void;
  onOpenPdfReport?: (batch: InvoiceBatch) => void;
}

export const AribaClearanceModal: React.FC<AribaClearanceModalProps> = ({
  batch,
  currentCurrency: _currentCurrency,
  onClose,
  onOpenPdfReport
}) => {
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedCxml, setCopiedCxml] = useState<boolean>(false);
  const [copiedGr, setCopiedGr] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'certificate' | 'gr_summary' | 'cxml' | 'tax' | 'guide'>('certificate');
  const [cxmlMode, setCxmlMode] = useState<'invoice' | 'ses'>('invoice');

  // Tax configuration state
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(
    batch.taxConfig || batch.clearanceCertificate?.taxConfig || DEFAULT_TAX_CONFIG
  );

  // Generate certificate if not already on batch
  const certificate: PreInvoiceClearance = batch.clearanceCertificate || generatePreInvoiceClearance(
    batch,
    'accounts.payable@abcompany.com',
    taxConfig
  );

  const taxCalculation = calculateTax(certificate.totalClearedAmount, taxConfig);

  const cxmlContent = cxmlMode === 'invoice'
    ? generateAribaCxml(batch, certificate, taxConfig)
    : generateServiceEntrySheetCxml(batch, certificate, taxConfig);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(certificate.aribaSubmissionCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyCxml = () => {
    navigator.clipboard.writeText(cxmlContent);
    setCopiedCxml(true);
    setTimeout(() => setCopiedCxml(false), 2500);
  };

  const handleDownloadCxml = () => {
    const prefix = cxmlMode === 'invoice' ? 'Ariba_PICC_Invoice' : 'Ariba_PICC_ServiceEntrySheet';
    downloadCxmlFile(`${prefix}_${batch.poNumber}_${certificate.certificateId}.cxml`, cxmlContent);
  };

  const handleDownloadDocument = () => {
    downloadCertificateDocument(batch, certificate);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyGr = () => {
    const headers = [
      'PO Line Item',
      'Purchase Order Number',
      'Purchase Order',
      'Resource Name',
      'Resource Email',
      'ADM Seniority',
      'ADM Role',
      'Resource Location (City)',
      'UOM',
      'Total Number of Days per Line Item (Ariba GR)',
      'Daily Rate',
      'Total Cleared Value',
      'Ariba Match Status'
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
        'DAY',
        finalDays,
        item.claimedDailyRate,
        finalAmount,
        'Cleared for Ariba GR'
      ].join('\t');
    });
    navigator.clipboard.writeText([headers.join('\t'), ...rows].join('\n'));
    setCopiedGr(true);
    setTimeout(() => setCopiedGr(false), 2500);
  };

  const handleDownloadGrCsv = () => {
    const headers = [
      'Purchase Order Number',
      'PO Line Item',
      'Purchase Order',
      'Resource Name',
      'Resource Email',
      'ADM Seniority',
      'ADM Role',
      'Resource Location (City)',
      'Project Code',
      'UOM',
      'Total Number of Days per Line Item',
      'Claimed Days',
      'Timesheet Days',
      'Daily Rate',
      'Cleared Amount',
      'Currency',
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
        `"${batch.currency || 'USD'}"`,
        `"CLEARED_FOR_ARIBA_GR"`
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ariba_Goods_Receipt_Quantities_${batch.poNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full my-8 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Top Action Bar */}
        <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">SAP Ariba Pre-Invoice Clearance Certificate (PICC)</span>
                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-mono font-semibold">
                  cXML 1.2 Dual Mode
                </span>
              </div>
              <span className="text-xs text-slate-400 block font-mono">
                PICC ID: {certificate.certificateId} • PO: {batch.poNumber}
              </span>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {onOpenPdfReport && (
              <button
                id="ariba-open-full-pdf-report-btn"
                onClick={() => {
                  onClose();
                  onOpenPdfReport(batch);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-xs"
                title="Open Printable Batch Summary & Clearance Audit Report"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Full Audit PDF Report</span>
              </button>
            )}

            <button
              onClick={handleDownloadCxml}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors shadow-xs"
              title={`Download SAP Ariba cXML ${cxmlMode === 'invoice' ? 'Commercial Invoice' : 'Service Entry Sheet'}`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Export {cxmlMode === 'invoice' ? 'Invoice cXML' : 'SES cXML'}</span>
            </button>

            <button
              onClick={handleDownloadDocument}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-600 text-white transition-colors shadow-xs"
              title="Download Official Standalone HTML/PDF Document"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Doc</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher Sub-header */}
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-2 flex items-center justify-between shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setActiveView('certificate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeView === 'certificate'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Visual Certificate</span>
            </button>

            <button
              onClick={() => setActiveView('gr_summary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeView === 'gr_summary'
                  ? 'bg-slate-900 text-emerald-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Ariba Goods Receipt (GR) Summary</span>
            </button>

            <button
              onClick={() => setActiveView('cxml')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeView === 'cxml'
                  ? 'bg-slate-900 text-emerald-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>SAP Ariba cXML Export</span>
            </button>

            <button
              onClick={() => setActiveView('tax')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeView === 'tax'
                  ? 'bg-slate-900 text-amber-300 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              <span>Tax & Withholding (WHT)</span>
            </button>

            <button
              onClick={() => setActiveView('guide')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeView === 'guide'
                  ? 'bg-slate-900 text-blue-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Ariba Submission Guide</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>Token:</span>
            <span className="text-emerald-400 font-bold">{certificate.aribaSubmissionCode}</span>
          </div>
        </div>

        {/* View: Tax & Withholding Engine */}
        {activeView === 'tax' && (
          <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50 text-slate-800 text-xs font-sans">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                  <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                  <span>Tax & Withholding Tax (WHT) Engine</span>
                </div>
                <span className="text-xs bg-amber-50 text-amber-800 font-semibold px-2 py-0.5 rounded border border-amber-200">
                  SAP Ariba Compliant
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Configure VAT, GST, Sales Tax, or intra-company reverse charge rules, plus withholding tax (WHT) deduction to be embedded into the cXML invoice and Service Entry Sheet payload.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Tax Settings Form */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Tax & Jurisdiction Parameters</h4>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Tax Jurisdiction</label>
                  <select
                    value={taxConfig.taxJurisdiction}
                    onChange={(e) => setTaxConfig({ ...taxConfig, taxJurisdiction: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-xs text-slate-800 focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="US-FEDERAL">United States (US Federal / State)</option>
                    <option value="UK-HMRC">United Kingdom (UK HMRC)</option>
                    <option value="EU-STANDARD">European Union (Standard EU VAT)</option>
                    <option value="SG-IRAS">Singapore (IRAS GST)</option>
                    <option value="IN-GST">India (GST / TDS System)</option>
                    <option value="CUSTOM">Custom International Jurisdiction</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tax Regime</label>
                    <select
                      value={taxConfig.taxType}
                      onChange={(e) => setTaxConfig({ ...taxConfig, taxType: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-xs text-slate-800"
                    >
                      <option value="VAT">VAT (Value Added Tax)</option>
                      <option value="GST">GST (Goods & Services)</option>
                      <option value="SALES_TAX">Sales Tax</option>
                      <option value="ZERO_RATED">Zero-Rated</option>
                      <option value="EXEMPT">Exempt</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      disabled={taxConfig.isReverseCharge}
                      value={taxConfig.taxRate}
                      onChange={(e) => setTaxConfig({ ...taxConfig, taxRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-xs text-slate-800 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taxConfig.isReverseCharge}
                      onChange={(e) => setTaxConfig({ ...taxConfig, isReverseCharge: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="font-semibold text-slate-800">Apply B2B Reverse Charge (0% Tax)</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-1 pl-6">
                    Customer accounts for VAT/GST in accordance with Article 196 of EU VAT Directive / cross-border rules.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Withholding Tax (WHT / TDS) Rate (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="50"
                    value={taxConfig.withholdingTaxRate || 0}
                    onChange={(e) => setTaxConfig({ ...taxConfig, withholdingTaxRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-xs text-slate-800"
                    placeholder="e.g. 2 for 2% TDS or 10 for 10% WHT"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Withheld at source by buyer prior to vendor remittance (reflected in SAP Ariba NetPayable).
                  </p>
                </div>
              </div>

              {/* Right Column: Real-time Calculation Breakdown */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-4">Calculated Financial Settlement</h4>

                  <div className="space-y-3 font-sans">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Reconciled Net Services (Pre-Tax):</span>
                      <span className="font-bold text-slate-900 font-mono text-sm">
                        {formatCurrency(taxCalculation.netAmount, certificate.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div>
                        <span className="text-slate-600 font-medium">{taxCalculation.taxType} ({taxCalculation.taxRate}%):</span>
                        {taxCalculation.isReverseCharge && (
                          <span className="block text-[10px] text-amber-600 font-semibold">Reverse Charge Active</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-900 font-mono text-sm">
                        {formatCurrency(taxCalculation.taxAmount, certificate.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 bg-slate-50 p-2 rounded-lg">
                      <span className="text-slate-700 font-semibold">Gross Commercial Amount:</span>
                      <span className="font-bold text-blue-700 font-mono text-base">
                        {formatCurrency(taxCalculation.grossAmount, certificate.currency)}
                      </span>
                    </div>

                    {taxCalculation.withholdingTaxAmount > 0 && (
                      <div className="flex items-center justify-between pb-2 border-b border-rose-100 text-rose-700 p-2 bg-rose-50/50 rounded-lg">
                        <div>
                          <span className="font-medium">Withholding Tax ({taxCalculation.withholdingTaxRate}%):</span>
                          <span className="block text-[10px] text-rose-500">Deducted at source for local tax revenue authority</span>
                        </div>
                        <span className="font-bold font-mono text-sm">
                          - {formatCurrency(taxCalculation.withholdingTaxAmount, certificate.currency)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div>
                        <span className="text-xs font-bold text-emerald-900 uppercase">Net Payable to Vendor:</span>
                        <span className="block text-[10px] text-emerald-700">Bank remittance amount posted in SAP Ariba</span>
                      </div>
                      <span className="font-black text-emerald-700 font-mono text-lg">
                        {formatCurrency(taxCalculation.netPayableAmount, certificate.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-right">
                  <button
                    onClick={() => setActiveView('cxml')}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>View Updated cXML Payload</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View 1: SAP Ariba cXML View with Dual Mode Switcher */}
        {activeView === 'cxml' && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-950 text-slate-200 font-mono text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-sans">
                    SAP Ariba cXML 1.2 Export
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-sans font-semibold text-[10px]">
                    {cxmlMode === 'invoice' ? 'Commercial Invoice' : 'Service Entry Sheet (SES)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                  {cxmlMode === 'invoice' 
                    ? 'Valid InvoiceDetailRequest with PreClearanceReference extrinsic tags for automated ERP three-way matching.'
                    : 'Valid ServiceEntrySheetRequest for preliminary contingent labor acceptance on SAP Ariba Network.'}
                </p>
              </div>

              {/* Dual Mode Switcher */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center">
                  <button
                    onClick={() => setCxmlMode('invoice')}
                    className={`px-2.5 py-1 rounded text-xs font-sans font-semibold flex items-center gap-1 transition-colors ${
                      cxmlMode === 'invoice' 
                        ? 'bg-emerald-600 text-white shadow-xs' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>Invoice</span>
                  </button>
                  <button
                    onClick={() => setCxmlMode('ses')}
                    className={`px-2.5 py-1 rounded text-xs font-sans font-semibold flex items-center gap-1 transition-colors ${
                      cxmlMode === 'ses' 
                        ? 'bg-blue-600 text-white shadow-xs' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Service Sheet (SES)</span>
                  </button>
                </div>

                <button
                  onClick={handleCopyCxml}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-sans font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  {copiedCxml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCxml ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={handleDownloadCxml}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-sans font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .cxml</span>
                </button>
              </div>
            </div>

            <div className="relative rounded-xl border border-slate-800 bg-slate-900/90 p-4 overflow-x-auto text-[11px] leading-relaxed text-slate-300">
              <pre className="font-mono whitespace-pre">{cxmlContent}</pre>
            </div>
          </div>
        )}

        {/* View 2: Ariba Network PO Submission Guide */}
        {activeView === 'guide' && (
          <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50 text-slate-700 text-xs font-sans">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>How to Submit Pre-Cleared Invoices to SAP Ariba</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                AB Company requires all vendor consulting invoices to be validated by the Pre-Invoice Clearance (PICC) engine prior to submission in the SAP Ariba Supplier Network. This guarantees zero payment delays and automated straight-through processing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                  1
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Export Certificate & cXML</h4>
                <p className="text-slate-500 leading-relaxed">
                  Download the official PICC certificate document (PDF/HTML) and the standardized <code className="text-slate-800 font-mono bg-slate-100 px-1 rounded">.cxml</code> file using the action buttons above.
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                  2
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Create Invoice on Ariba</h4>
                <p className="text-slate-500 leading-relaxed">
                  Log into supplier.ariba.com, locate Purchase Order <strong className="font-mono text-slate-900">{batch.poNumber}</strong>, and initiate standard PO invoice creation for billing period <strong className="font-mono text-slate-900">{batch.billingMonth}</strong>.
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                  3
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Attach PICC & Enter Token</h4>
                <p className="text-slate-500 leading-relaxed">
                  Attach the certificate in the Ariba "Attachments" tab, and copy the Pre-Clearance token <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1 rounded">{certificate.aribaSubmissionCode}</span> into the invoice header extrinsic reference.
                </p>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="font-bold text-emerald-900 text-sm">Automated ERP Three-Way Match Guarantee</h5>
                <p className="text-emerald-800 leading-relaxed text-[11px]">
                  Because all <strong>{certificate.reconciledLineItemsCount} line items</strong> have been reconciled against internal timesheets and signed off by authorized managers, your submission will bypass manual AP queue review and enter straight-through payment scheduling.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* View: Ariba Goods Receipt (GR / SES) Summary Table */}
        {activeView === 'gr_summary' && (
          <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
            {/* Header & Context */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                    <PackageCheck className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    SAP Ariba Goods Receipt (GR / SES) Line-Item Summary Table
                  </h3>
                </div>
                <p className="text-xs text-slate-600 pl-10 max-w-2xl">
                  Authorized quantities per line item displaying <strong>Purchase Order</strong>, <strong>PO Number</strong>, and <strong>Total Number of days per line item</strong>. Used for receiving in Ariba when the vendor submits their actual invoice.
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyGr}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors"
                  title="Copy table formatted for Excel or Ariba entry"
                >
                  {copiedGr ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Copied TSV!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy GR Data</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadGrCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors"
                  title="Download Goods Receipt Summary CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download CSV</span>
                </button>

                {onOpenPdfReport && (
                  <button
                    type="button"
                    onClick={() => onOpenPdfReport(batch)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                    title="View in full PDF audit report"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>View Audit PDF</span>
                  </button>
                )}
              </div>
            </div>

            {/* Operational Mandate Banner */}
            <div className="bg-emerald-50/90 border border-emerald-300/80 rounded-xl p-4 text-xs text-emerald-950 flex items-start gap-3">
              <div className="p-1.5 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5 shadow-2xs">
                <PackageCheck className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="font-bold text-emerald-900 text-sm">
                  Ariba 3-Way Match Receiving Directive
                </div>
                <p className="text-emerald-900/90 leading-relaxed">
                  When <strong>{batch.vendorName}</strong> submits their commercial tax invoice against PO <strong className="font-mono text-slate-900">{batch.poNumber}</strong>, SAP Ariba conducts a strict 3-way line match comparing the PO line item, the approved Goods Receipt (GR) or Service Entry Sheet (SES), and the vendor's invoice. Post the <strong>Total Number of Days</strong> shown below into Ariba to ensure instant automated 3-way match clearance without price or quantity hold exceptions.
                </p>
              </div>
            </div>

            {/* Goods Receipt Summary Table */}
            <div className="bg-white border border-slate-300 rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[10px] font-bold tracking-wider">
                      <th className="py-3 px-3">PO Line Item</th>
                      <th className="py-3 px-3">Purchase Order Number</th>
                      <th className="py-3 px-3">Consultant / Resource</th>
                      <th className="py-3 px-2">ADM Role & Seniority</th>
                      <th className="py-3 px-2">Location (City)</th>
                      <th className="py-3 px-2 text-center">UOM</th>
                      <th className="py-3 px-3 text-center bg-emerald-700 text-white font-black">
                        Total Number of Days per Line Item
                      </th>
                      <th className="py-3 px-3 text-right">Daily Rate</th>
                      <th className="py-3 px-3 text-right">Total Cleared Value</th>
                      <th className="py-3 px-3 text-center">Ariba Match Status</th>
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
                        <tr key={`ariba-gr-tab-${item.id}`} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded font-mono font-black text-xs bg-blue-50 text-blue-800 border border-blue-200">
                              {linePoItem}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-extrabold text-blue-700 whitespace-nowrap">
                            <div>{linePoNumber}</div>
                            <div className="text-[10px] font-sans font-normal text-slate-500">{batch.vendorName}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{item.resourceName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {item.resourceEmail}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <div className="font-semibold text-slate-800">{item.admRole || 'Cloud Consultant'}</div>
                            <span className="inline-block px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-medium border border-slate-200">
                              {item.admSeniority || 'Senior'}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-slate-700 font-medium">
                            {item.locationCity || 'Chicago'}
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-slate-600">
                            DAY
                          </td>
                          <td className="py-3 px-3 text-center bg-emerald-50/80 border-x border-emerald-200">
                            <div className="inline-flex items-center gap-1 font-black text-sm text-emerald-900">
                              <span>{finalDays}</span>
                              <span className="text-[10px] font-bold text-emerald-700 uppercase">Days</span>
                            </div>
                            <div className="text-[9px] text-slate-500">
                              (Claim: {item.billedDays}d • TS: {item.internalApprovedDays}d)
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700">
                            {formatCurrency(item.claimedDailyRate, batch.currency || 'USD')}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(finalAmount, batch.currency || 'USD')}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
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
                      <td colSpan={6} className="py-3 px-3 text-right text-xs uppercase tracking-wide">
                        Ariba Goods Receipt Grand Totals ({batch.items.length} Line Items):
                      </td>
                      <td className="py-3 px-3 text-center bg-emerald-100/90 border-x border-emerald-300">
                        <div className="text-base font-black text-emerald-900">
                          {certificate.totalClearedDays} Days
                        </div>
                        <div className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider">
                          Total Approved Days
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-500 text-[10px] font-mono">
                        Avg: {formatCurrency(certificate.totalClearedAmount / (certificate.totalClearedDays || 1), batch.currency || 'USD')}/d
                      </td>
                      <td className="py-3 px-3 text-right font-black text-sm text-slate-950 font-mono">
                        {formatCurrency(certificate.totalClearedAmount, batch.currency || 'USD')}
                      </td>
                      <td className="py-3 px-3 text-center text-[10px] text-emerald-800 uppercase font-extrabold">
                        3-Way Match Verified
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* View 3: Visual Printable Certificate Body */}
        {activeView === 'certificate' && (
        <div className="p-8 overflow-y-auto space-y-6 text-slate-800 font-sans print:p-0 print:m-0 flex-1" id="printable-clearance-certificate">
          
          {/* Certificate Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
            <div>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-700 text-white font-bold flex items-center justify-center text-lg shadow-sm">
                  AB
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">AB COMPANY GLOBAL INC.</h1>
                  <p className="text-xs text-slate-500 font-medium">Corporate Accounts Payable & Invoicing Governance</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-600 space-y-0.5">
                <div>100 Technology Plaza, Suite 400 • New York, NY 10001</div>
                <div>AP Verification Inquiries: <span className="font-mono text-slate-800">ap-reconcile@abcompany.com</span></div>
              </div>
            </div>

            <div className="text-right space-y-1">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ PRE-INVOICE CLEARED
              </span>
              <div className="text-xs text-slate-500 font-mono mt-1">
                Issued: {new Date(certificate.issuedAt).toLocaleDateString()}
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                Auth Hash: {certificate.verificationAuditHash.slice(0, 18)}...
              </div>
            </div>
          </div>

          {/* Key Identification Box */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Purchase Order (PO)</span>
              <span className="font-bold text-slate-900 font-mono text-sm">{batch.poNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Vendor Organization</span>
              <span className="font-bold text-slate-900">{batch.vendorName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Billing Period</span>
              <span className="font-bold text-slate-900">{batch.billingMonth}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">Reconciled Currency</span>
              <span className="font-bold text-slate-900">{certificate.currency} (Local)</span>
            </div>
          </div>

          {/* Financial Clearance Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <span className="text-xs text-slate-500 block font-medium">Total Cleared Days</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {certificate.totalClearedDays} Days
              </div>
              <span className="text-[11px] text-slate-500">
                Verified against internal timesheet logs
              </span>
            </div>

            <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50 shadow-2xs">
              <span className="text-xs text-emerald-800 block font-medium">Net Services (Pre-Tax)</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {formatCurrency(taxCalculation.netAmount, certificate.currency)}
              </div>
              <span className="text-[11px] text-emerald-800/80">
                {taxCalculation.isReverseCharge ? 'Reverse charge exempt' : `${taxCalculation.taxType} ${taxCalculation.taxRate}% applied`}
              </span>
            </div>

            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/50 shadow-2xs">
              <span className="text-xs text-blue-800 block font-medium">Net Payable to Vendor</span>
              <div className="text-2xl font-black text-blue-700 mt-1">
                {formatCurrency(taxCalculation.netPayableAmount, certificate.currency)}
              </div>
              <span className="text-[11px] text-blue-800/80">
                {taxCalculation.withholdingTaxAmount > 0 
                  ? `After ${taxCalculation.withholdingTaxRate}% WHT deduction` 
                  : 'Authorized for SAP Ariba release'}
              </span>
            </div>
          </div>

          {/* Reconciliation Line Items Breakdown */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Resource-by-Resource Reconciliation Audit Schedule
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Resource & Email ID (Key)</th>
                    <th className="py-2.5 px-2">Billed Days</th>
                    <th className="py-2.5 px-2">Approved Days</th>
                    <th className="py-2.5 px-2">Rate / Day</th>
                    <th className="py-2.5 px-2">Cleared Total</th>
                    <th className="py-2.5 px-3">Manager Sign-off / Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {batch.items.map((item) => {
                    const finalDays = item.managerDecision ? item.managerDecision.finalApprovedDays : item.internalApprovedDays || item.billedDays;
                    const finalAmount = item.managerDecision ? item.managerDecision.finalApprovedAmount : (finalDays * item.claimedDailyRate);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{item.resourceName}</div>
                          <div className="text-[11px] font-mono text-slate-500">{item.resourceEmail}</div>
                        </td>
                        <td className="py-2.5 px-2 font-medium">{item.billedDays}d</td>
                        <td className="py-2.5 px-2 font-bold text-emerald-700">{finalDays}d</td>
                        <td className="py-2.5 px-2">{formatCurrency(item.claimedDailyRate, certificate.currency)}</td>
                        <td className="py-2.5 px-2 font-bold text-slate-900">{formatCurrency(finalAmount, certificate.currency)}</td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {item.managerDecision ? (
                            <div>
                              <span className="font-semibold text-emerald-800">
                                ✓ Authorized by {item.managerDecision.decidedByName}
                              </span>
                              <div className="text-slate-500 italic mt-0.5">
                                "{item.managerDecision.justificationNotes}"
                              </div>
                            </div>
                          ) : (
                            <span className="text-emerald-700 font-medium">✓ 100% Timesheet Match</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SAP Ariba Instructions & Submission Token */}
          <div className="bg-slate-900 text-white rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Mandatory SAP Ariba Submission Token
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Paste this token into the <span className="font-mono text-emerald-300">PreClearanceReference</span> field when submitting in Ariba.
                </p>
              </div>

              <div className="flex items-center space-x-2 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                <span className="font-mono font-bold text-sm text-emerald-400 tracking-wider">
                  {certificate.aribaSubmissionCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  title="Copy Submission Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-3 space-y-1">
              <div className="font-semibold text-slate-300">Instructions for Vendor Accounts Receivable:</div>
              <p>
                1. Save/Print this document as <span className="font-mono text-slate-200">AB_PICC_Clearance_{batch.poNumber}.pdf</span>.<br />
                2. During invoice creation on the SAP Ariba Supplier Network, attach this PDF in the "Attachments" section.<br />
                3. Enter the token above in the pre-clearance field. Invoices submitted with mismatching days will be rejected by AB Company's ERP robot.
              </p>
            </div>
          </div>

          {/* Digital Signature Footer */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
            <div>
              <span className="font-semibold text-slate-700">Digital Audit Trail ID:</span> {certificate.verificationAuditHash}
            </div>
            <div>
              Verified by AB Company Automated Reconciliation Service
            </div>
          </div>

        </div>
        )}

      </div>
    </div>
  );
};
