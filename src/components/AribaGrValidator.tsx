import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  FileText, 
  Upload, 
  ShieldCheck, 
  FileCheck2, 
  Copy, 
  Check, 
  RotateCcw, 
  Download, 
  Building, 
  Info,
  BadgeCheck
} from 'lucide-react';
import { InvoiceBatch, UserProfile, AribaGrValidationResult } from '../types';
import { validateInvoiceAgainstClearance } from '../utils/aribaGrValidatorEngine';
import { getDomainCooForManager } from '../data/mockCentralDb';
import * as XLSX from 'xlsx';

interface AribaGrValidatorProps {
  batches: InvoiceBatch[];
  currentUser: UserProfile;
  formatCurrency: (amount: number, currency: string) => string;
  onLogAudit: (action: string, details: string, batchId?: string, poNumber?: string) => void;
  onSendNotification?: (notif: any) => void;
}

export const AribaGrValidator: React.FC<AribaGrValidatorProps> = ({
  batches,
  currentUser,
  formatCurrency,
  onLogAudit
}) => {
  // Find all batches that have reached approval or have clearance certificate
  const eligibleBatches = useMemo(() => {
    return batches.filter(b => b.status === 'CLEARED_FOR_ARIBA' || b.clearanceCertificate || b.items.some(i => !!i.managerDecision));
  }, [batches]);

  const defaultBatch = eligibleBatches[0] || batches[0];
  const [selectedBatchId, setSelectedBatchId] = useState<string>(defaultBatch?.id || '');
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<string>('clean');
  const [customInvoiceRows, setCustomInvoiceRows] = useState<Record<string, any>[] | null>(null);
  const [fileName, setFileName] = useState<string>('Apex_Invoice_Final_Aug2026.xlsx');
  const [signedOff, setSignedOff] = useState<boolean>(false);

  const currentBatch = useMemo(() => {
    return batches.find(b => b.id === selectedBatchId) || defaultBatch;
  }, [batches, selectedBatchId, defaultBatch]);

  // Lookup Domain COO and UBR for current batch's manager
  const sampleManagerEmail = currentBatch?.items[0]?.managerEmail;
  const domainCoo = useMemo(() => {
    return getDomainCooForManager(sampleManagerEmail, currentBatch?.items[0]?.department);
  }, [sampleManagerEmail, currentBatch]);

  // Scenario 1: Clean Matching Invoice (Days & Rates match manager approval; includes raw VAT that should be ignored)
  const cleanScenarioRows = useMemo(() => {
    if (!currentBatch) return [];
    return currentBatch.items.map(item => {
      const approvedDays = item.managerDecision?.finalApprovedDays ?? item.billedDays;
      return {
        'Resource Email ID': item.resourceEmail,
        'Resource Name': item.resourceName,
        'PO Line Item': item.poLineItem || '00010',
        'Billed Days': approvedDays,
        'Daily Rate': item.contractDailyRate,
        'Pre-Tax Amount': approvedDays * item.contractDailyRate,
        'VAT (18%)': Number((approvedDays * item.contractDailyRate * 0.18).toFixed(2)),
        'Gross Total': Number((approvedDays * item.contractDailyRate * 1.18).toFixed(2))
      };
    });
  }, [currentBatch]);

  // Scenario 2: Tampered / Discrepant Invoice (Vendor reverted a manager-adjusted line from 18 back to 21 days)
  const tamperedScenarioRows = useMemo(() => {
    if (!currentBatch) return [];
    return currentBatch.items.map((item, idx) => {
      let days = item.managerDecision?.finalApprovedDays ?? item.billedDays;
      let rate = item.contractDailyRate;
      
      // Tamper with the first item (inflate days) or second item (inflate rate)
      if (idx === 0) {
        days = days + 3; // Inflated days
      } else if (idx === 1) {
        rate = rate + 50; // Inflated rate
      }

      return {
        'Resource Email ID': item.resourceEmail,
        'Resource Name': item.resourceName,
        'PO Line Item': item.poLineItem || '00010',
        'Billed Days': days,
        'Daily Rate': rate,
        'Pre-Tax Amount': days * rate,
        'VAT (18%)': Number((days * rate * 0.18).toFixed(2)),
        'Gross Total': Number((days * rate * 1.18).toFixed(2))
      };
    });
  }, [currentBatch]);

  // Scenario 3: Alternative Vendor Format (No email column, headers are 'Worked Days' & 'Unit Cost')
  const altFormatScenarioRows = useMemo(() => {
    if (!currentBatch) return [];
    return currentBatch.items.map(item => {
      const approvedDays = item.managerDecision?.finalApprovedDays ?? item.billedDays;
      return {
        'Consultant Name': item.resourceName,
        'Item Number': item.poLineItem || '00010',
        'Worked Days': approvedDays,
        'Unit Cost': item.contractDailyRate,
        'Net Subtotal': approvedDays * item.contractDailyRate,
        'Sales Tax': 0
      };
    });
  }, [currentBatch]);

  // Determine active rows to validate
  const activeRowsToValidate = useMemo(() => {
    if (customInvoiceRows) return customInvoiceRows;
    if (activeScenario === 'tampered') return tamperedScenarioRows;
    if (activeScenario === 'alt_format') return altFormatScenarioRows;
    return cleanScenarioRows;
  }, [customInvoiceRows, activeScenario, cleanScenarioRows, tamperedScenarioRows, altFormatScenarioRows]);

  // Run validation engine
  const validationResult: AribaGrValidationResult | null = useMemo(() => {
    if (!currentBatch || activeRowsToValidate.length === 0) return null;
    return validateInvoiceAgainstClearance(
      currentBatch,
      activeRowsToValidate,
      { name: currentUser.name, email: currentUser.email }
    );
  }, [currentBatch, activeRowsToValidate, currentUser]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

        if (json.length > 0) {
          setCustomInvoiceRows(json);
          setActiveScenario('custom');
          setSignedOff(false);
          onLogAudit(
            'ARIBA_GR_INVOICE_UPLOADED',
            `Domain COO uploaded vendor actual invoice file "${file.name}" with ${json.length} line items for PO ${currentBatch?.poNumber}.`,
            currentBatch?.id,
            currentBatch?.poNumber
          );
        }
      } catch (err) {
        console.error('Failed to parse invoice file:', err);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCopyStamp = () => {
    if (!validationResult) return;
    const stamp = `[SAP ARIBA GOODS RECEIPT CLEARANCE STAMP]
Certificate ID: ${validationResult.certificateId}
Purchase Order: ${validationResult.poNumber}
Vendor: ${validationResult.vendorName}
Primary Billed Days (Match Confirmed): ${validationResult.totalActualInvoiceDays} days
Pre-Tax Validated Amount (Indicative): ${formatCurrency(validationResult.totalActualInvoicePreTaxAmount, validationResult.currency)}
Validated By: ${currentUser.name} (${currentUser.role.toUpperCase()})
Timestamp: ${new Date().toISOString()}
Goods Receipt Verdict: AUTHORIZED FOR SAP ARIBA GR CREATION`;
    navigator.clipboard.writeText(stamp);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleDomainCooSignOff = () => {
    if (!validationResult) return;
    setSignedOff(true);
    onLogAudit(
      'DOMAIN_COO_GR_AUTHORIZED',
      `Domain COO ${currentUser.name} authorized Goods Receipt in SAP Ariba for PO ${validationResult.poNumber}. Validated ${validationResult.linesValidatedCount} line items. Total Days: ${validationResult.totalActualInvoiceDays} d (PICC: ${validationResult.certificateId}).`,
      currentBatch?.id,
      validationResult.poNumber
    );
  };

  const handleExportCsv = () => {
    if (!validationResult) return;
    const exportData = validationResult.lineResults.map(r => ({
      'Line #': r.lineIndex,
      'Resource Name': r.resourceName,
      'Resource Email': r.resourceEmail || 'N/A',
      'PO Line Item': r.poLineItem || '00010',
      'Approved Days': r.matchedApprovedItem ? (r.matchedApprovedItem.managerDecision?.finalApprovedDays ?? r.matchedApprovedItem.billedDays) : 'N/A',
      'Actual Invoice Days': r.billedDays,
      'Days Variance': r.dayDifference,
      'Day Match Verdict': r.dayMatchStatus,
      'Contract Daily Rate': r.matchedApprovedItem?.contractDailyRate || 'N/A',
      'Actual Invoice Rate': r.dailyRate,
      'Rate Match Verdict': r.rateMatchStatus,
      'Pre-Tax Approved Amount': r.matchedApprovedItem ? (r.matchedApprovedItem.managerDecision?.finalApprovedAmount ?? r.matchedApprovedItem.billedTotalAmount) : 'N/A',
      'Pre-Tax Invoice Amount (Indicative)': r.preTaxAmount,
      'Status Notes': r.statusNote
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ariba_GR_Audit');
    XLSX.writeFile(wb, `Ariba_GR_Validation_${validationResult.poNumber}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!currentBatch) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <Info className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-slate-800">No Reconciliation Batches Available</h3>
        <p className="text-slate-500 text-sm mt-1">Please upload or select a batch to run Ariba Goods Receipt validation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Executive Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Domain COO Authority
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Ariba Goods Receipt (GR) Pre-Check
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-indigo-400" />
              Domain COO Invoice Alignment & Ariba GR Validator
            </h1>
            <p className="text-slate-300 text-sm max-w-3xl">
              Cross-examine the vendor's actual commercial tax invoice against the Manager-Approved Pre-Invoice Clearance certificate prior to issuing Goods Receipt (GR) in SAP Ariba.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-mono">Assigned Domain COO</span>
              <span className="text-sm font-semibold text-white block">{domainCoo.cooName}</span>
              <span className="text-[11px] text-indigo-300 block">{domainCoo.ubrCode} • {domainCoo.domainName}</span>
            </div>
            <img 
              src={domainCoo.avatarUrl || "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=120&auto=format&fit=crop&q=60"} 
              alt={domainCoo.cooName} 
              className="w-11 h-11 rounded-full border-2 border-indigo-400/40 object-cover"
            />
          </div>
        </div>

        {/* Executive Principles Strip */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="flex items-start gap-2 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200 block">Primary Match: Billed Days</span>
              <span className="text-slate-400">Exact match on number of days worked per line item against manager approvals.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
            <BadgeCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200 block">Secondary Match: Daily Rate</span>
              <span className="text-slate-400">Enforces contracted daily rate without unapproved markups.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200 block">Taxes Excluded (Pre-Tax Basis)</span>
              <span className="text-slate-400">Reconciliation evaluates pre-tax days and rates. Amounts are indicative only.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control & Batch Selection Card */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              1. Select Manager-Approved Clearance Batch
            </label>
            <div className="flex items-center gap-3">
              <select
                id="ariba-gr-batch-select"
                value={selectedBatchId}
                onChange={(e) => {
                  setSelectedBatchId(e.target.value);
                  setCustomInvoiceRows(null);
                  setSignedOff(false);
                }}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[320px]"
              >
                {eligibleBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.poNumber} — {b.vendorName} ({b.billingMonth}) • {b.clearanceCertificate?.certificateId || 'In Review'}
                  </option>
                ))}
              </select>

              <span className="text-xs text-slate-500 font-mono">
                {currentBatch.items.length} line items • PICC: {currentBatch.clearanceCertificate?.certificateId || 'AB-PICC-2026-0811'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
              <Upload className="w-4 h-4 text-indigo-600" />
              Upload Vendor Actual Invoice (.xlsx, .csv)
              <input 
                type="file" 
                accept=".xlsx,.xls,.csv" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
            </label>

            {customInvoiceRows && (
              <button
                onClick={() => {
                  setCustomInvoiceRows(null);
                  setActiveScenario('clean');
                  setFileName('Apex_Invoice_Final_Aug2026.xlsx');
                  setSignedOff(false);
                }}
                className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium flex items-center gap-1"
                title="Reset to test scenarios"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Fast Test Scenarios Selector */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
            Fast Test Scenarios:
          </span>
          <button
            onClick={() => {
              setCustomInvoiceRows(null);
              setActiveScenario('clean');
              setFileName('Apex_Final_Invoice_CleanMatch.xlsx');
              setSignedOff(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
              activeScenario === 'clean' && !customInvoiceRows
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Clean Matching Invoice (Go-Ahead)
          </button>

          <button
            onClick={() => {
              setCustomInvoiceRows(null);
              setActiveScenario('tampered');
              setFileName('Apex_Final_Invoice_Overbilled.xlsx');
              setSignedOff(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
              activeScenario === 'tampered' && !customInvoiceRows
                ? 'bg-red-50 text-red-800 border-red-300 font-semibold shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            Tampered Invoice (+3 Days Overbilled)
          </button>

          <button
            onClick={() => {
              setCustomInvoiceRows(null);
              setActiveScenario('alt_format');
              setFileName('Apex_Invoice_AlternateFormat.csv');
              setSignedOff(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
              activeScenario === 'alt_format' && !customInvoiceRows
                ? 'bg-blue-50 text-blue-800 border-blue-300 font-semibold shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            Alternate Vendor Format (No Email, 'Worked Days')
          </button>

          {customInvoiceRows && (
            <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
              <FileCheck2 className="w-3.5 h-3.5" />
              Loaded: {fileName} ({customInvoiceRows.length} rows)
            </span>
          )}
        </div>
      </div>

      {/* Primary Decision Banner */}
      {validationResult && (
        <div 
          id="ariba-gr-decision-banner"
          className={`p-6 rounded-2xl border transition-all shadow-xs ${
            validationResult.decision === 'PROCEED_WITH_GR'
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              : 'bg-red-50/90 border-red-200 text-red-950'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                validationResult.decision === 'PROCEED_WITH_GR'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-red-600 text-white shadow-sm'
              }`}>
                {validationResult.decision === 'PROCEED_WITH_GR' ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : (
                  <AlertTriangle className="w-7 h-7" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    validationResult.decision === 'PROCEED_WITH_GR'
                      ? 'bg-emerald-200/60 text-emerald-900'
                      : 'bg-red-200/60 text-red-900'
                  }`}>
                    {validationResult.decision === 'PROCEED_WITH_GR'
                      ? 'Executive Decision: Green Light'
                      : 'Executive Decision: Critical Hold'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    Audit ID: {validationResult.validationId}
                  </span>
                </div>

                <h2 className="text-xl font-bold tracking-tight">
                  {validationResult.decision === 'PROCEED_WITH_GR'
                    ? 'GO AHEAD WITH GOODS RECEIPT (GR) IN SAP ARIBA'
                    : 'DO NOT PROCEED WITH GOODS RECEIPT (GR) — MISMATCH DETECTED'}
                </h2>

                <p className="text-sm opacity-90 max-w-3xl leading-relaxed">
                  {validationResult.summaryMessage}
                </p>
                
                <p className="text-xs opacity-75 italic pt-1">
                  {validationResult.taxNote}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0">
              {validationResult.decision === 'PROCEED_WITH_GR' ? (
                <>
                  <button
                    id="btn-sign-off-gr"
                    onClick={handleDomainCooSignOff}
                    disabled={signedOff}
                    className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all ${
                      signedOff
                        ? 'bg-emerald-700 text-white opacity-90 cursor-default'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {signedOff ? 'Goods Receipt Signed Off by COO' : 'Sign Off GR as Domain COO'}
                  </button>

                  <button
                    onClick={handleCopyStamp}
                    className="px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    {copiedToken ? 'Clearance Stamp Copied!' : 'Copy Ariba GR Clearance Stamp'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      alert(`Discrepancy notice dispatched to ${currentBatch.vendorEmail} for PO ${currentBatch.poNumber}. The vendor has been instructed to cancel invoice and resubmit with manager-approved line items.`);
                      onLogAudit(
                        'VENDOR_GR_REJECTION_DISPATCHED',
                        `Discrepancy rejection notice sent to ${currentBatch.vendorEmail}. ${validationResult.mismatchedLinesCount} line items violated clearance certificate.`,
                        currentBatch.id,
                        currentBatch.poNumber
                      );
                    }}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Send Rejection Notice to Vendor
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="px-4 py-2 bg-white hover:bg-red-50 text-red-800 border border-red-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export Discrepancy Breakdown (.xlsx)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Comparison Strip */}
      {validationResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Approved Days vs Actual Days (PRIMARY) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Billed Days (Primary)
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-800">
                {validationResult.totalActualInvoiceDays.toFixed(2)} d
              </span>
              <span className="text-xs font-medium text-slate-500">
                Approved: {validationResult.totalApprovedDays.toFixed(2)} d
              </span>
            </div>
            <div className="pt-1">
              {Math.abs(validationResult.daysDifference) < 0.001 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Exact Match (0.00d)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  <AlertTriangle className="w-3 h-3" /> {validationResult.daysDifference > 0 ? '+' : ''}{validationResult.daysDifference}d Variance
                </span>
              )}
            </div>
          </div>

          {/* Pre-Tax Amount (INDICATIVE) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Pre-Tax Amount (Indicative Only)
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-800">
                {formatCurrency(validationResult.totalActualInvoicePreTaxAmount, validationResult.currency)}
              </span>
              <span className="text-xs font-medium text-slate-500">
                Pre-Tax
              </span>
            </div>
            <div className="pt-1">
              <span className="text-[11px] text-slate-500">
                Approved: {formatCurrency(validationResult.totalApprovedPreTaxAmount, validationResult.currency)}
              </span>
            </div>
          </div>

          {/* Line Items Compliance */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Line-Item Match Status
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-800">
                {validationResult.matchedLinesCount} / {validationResult.linesValidatedCount}
              </span>
              <span className="text-xs font-medium text-slate-500">
                Lines Matched
              </span>
            </div>
            <div className="pt-1">
              {validationResult.mismatchedLinesCount === 0 ? (
                <span className="text-xs text-emerald-700 font-medium">100% Lines Verified</span>
              ) : (
                <span className="text-xs text-red-700 font-medium">{validationResult.mismatchedLinesCount} line(s) diverging</span>
              )}
            </div>
          </div>

          {/* Governance & Mapping */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Clearance Governance
            </span>
            <div className="text-xs space-y-0.5 pt-0.5">
              <div className="flex justify-between">
                <span className="text-slate-500">PICC Token:</span>
                <span className="font-mono font-medium text-slate-800">{validationResult.certificateId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UBR Reference:</span>
                <span className="font-medium text-indigo-700">{domainCoo.ubrCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Manager:</span>
                <span className="text-slate-800">{currentBatch.items[0]?.managerName || 'Sarah Jenkins'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Line-by-Line Comparison Table */}
      {validationResult && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                Line-by-Line Alignment Audit: Approved Clearance vs Vendor Actual Invoice
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Primary audit criterion: Billed Days match. Daily Rate checked against contract. Taxes are explicitly excluded.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Export Audit (.xlsx)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Resource / Contractor</th>
                  <th className="p-3">PO Line</th>
                  <th className="p-3 bg-indigo-50/40 text-indigo-900 border-l border-indigo-100">
                    Approved Days (PICC)
                  </th>
                  <th className="p-3 bg-indigo-50/40 text-indigo-900">
                    Invoice Days
                  </th>
                  <th className="p-3 bg-indigo-50/40 text-indigo-900 border-r border-indigo-100">
                    Day Match (Primary)
                  </th>
                  <th className="p-3">Contract Rate</th>
                  <th className="p-3">Invoice Rate</th>
                  <th className="p-3">Rate Match</th>
                  <th className="p-3">Pre-Tax Amount (Indicative)</th>
                  <th className="p-3">Audit Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {validationResult.lineResults.map((line) => {
                  const approvedDays = line.matchedApprovedItem 
                    ? (line.matchedApprovedItem.managerDecision?.finalApprovedDays ?? line.matchedApprovedItem.billedDays)
                    : null;
                  const approvedRate = line.matchedApprovedItem?.contractDailyRate;
                  const hasDayMismatch = line.dayMatchStatus !== 'MATCH';
                  const hasRateMismatch = line.rateMatchStatus !== 'MATCH';

                  return (
                    <tr 
                      key={line.lineIndex}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        hasDayMismatch || hasRateMismatch ? 'bg-red-50/40' : ''
                      }`}
                    >
                      <td className="p-3 text-center text-slate-400 font-mono">
                        {line.lineIndex}
                      </td>

                      {/* Resource details */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-900">{line.resourceName}</div>
                        {line.resourceEmail && (
                          <div className="text-[11px] text-slate-500 font-mono">{line.resourceEmail}</div>
                        )}
                      </td>

                      {/* PO Line Item */}
                      <td className="p-3 font-mono text-slate-600">
                        {line.poLineItem || '00010'}
                      </td>

                      {/* Approved Days */}
                      <td className="p-3 font-mono font-medium text-slate-900 bg-indigo-50/20 border-l border-indigo-100">
                        {approvedDays !== null ? `${approvedDays.toFixed(2)} d` : '—'}
                      </td>

                      {/* Actual Invoice Days */}
                      <td className="p-3 font-mono font-bold text-slate-900 bg-indigo-50/20">
                        {line.billedDays.toFixed(2)} d
                      </td>

                      {/* Day Match Verdict */}
                      <td className="p-3 bg-indigo-50/20 border-r border-indigo-100">
                        {line.dayMatchStatus === 'MATCH' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            PASS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                            <XCircle className="w-3 h-3 text-red-600" />
                            {line.dayDifference > 0 ? `+${line.dayDifference}d OVER` : `${line.dayDifference}d`}
                          </span>
                        )}
                      </td>

                      {/* Contract Rate */}
                      <td className="p-3 font-mono text-slate-600">
                        {approvedRate ? formatCurrency(approvedRate, validationResult.currency) : '—'}
                      </td>

                      {/* Actual Invoice Rate */}
                      <td className="p-3 font-mono font-medium text-slate-900">
                        {formatCurrency(line.dailyRate, validationResult.currency)}
                      </td>

                      {/* Rate Match Verdict */}
                      <td className="p-3">
                        {line.rateMatchStatus === 'MATCH' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            PASS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                            <XCircle className="w-3 h-3 text-red-600" />
                            RATE MISMATCH
                          </span>
                        )}
                      </td>

                      {/* Pre-Tax Amount (Indicative) */}
                      <td className="p-3 font-mono font-medium text-slate-900">
                        {formatCurrency(line.preTaxAmount, validationResult.currency)}
                        <span className="text-[10px] text-slate-400 block">Excl. Tax</span>
                      </td>

                      {/* Status Notes */}
                      <td className="p-3 text-[11px]">
                        {hasDayMismatch || hasRateMismatch ? (
                          <span className="text-red-700 font-medium block leading-tight">
                            {line.statusNote}
                          </span>
                        ) : (
                          <span className="text-emerald-700 block leading-tight">
                            {line.statusNote}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-slate-400" />
              <span>Domain COO Office: {domainCoo.domainName} ({domainCoo.ubrCode})</span>
            </div>
            <div>
              <span>Taxes policy: VAT/GST excluded from automated day & rate reconciliation checks.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
