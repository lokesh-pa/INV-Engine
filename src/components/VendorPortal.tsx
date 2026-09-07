import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Send, 
  RotateCcw, 
  FileText, 
  ShieldCheck, 
  Info, 
  Clock, 
  Sparkles,
  Search,
  SlidersHorizontal,
  Edit3,
  Check,
  CheckCheck,
  X,
  ArrowRight,
  HelpCircle,
  BellRing,
  Printer,
  TrendingUp,
  RefreshCw,
  Layers,
  Copy,
  Table
} from 'lucide-react';
import { 
  InvoiceBatch, 
  InternalTimesheet, 
  Currency, 
  UserProfile, 
  DiscrepancyItem
} from '../types';
import { parseExcelFile, downloadVendorInvoiceTemplate } from '../utils/excelHelper';
import { reconcileInvoiceRows, formatCurrency } from '../utils/reconciliationEngine';
import { ACTIVE_PURCHASE_ORDERS, SAMPLE_VENDOR_INVOICE_ROWS } from '../data/mockCentralDb';
import { InvoiceStatusChart } from './InvoiceStatusChart';
import { HistoricalTrendView } from './HistoricalTrendView';

interface VendorPortalProps {
  currentUser: UserProfile;
  currentCurrency: Currency;
  timesheets: InternalTimesheet[];
  currentBatch: InvoiceBatch | null;
  batches?: InvoiceBatch[];
  onBatchUpdated: (batch: InvoiceBatch) => void;
  onInitiateApproval: (batch: InvoiceBatch) => void;
  onOpenAribaCertificate: (batch: InvoiceBatch) => void;
  onCorrectLineItem?: (
    batchId: string,
    itemId: string,
    newDays: number,
    newRate: number,
    notes: string,
    isResubmission: boolean
  ) => void;
  onNavigateToManager?: (managerEmail: string) => void;
  onNavigateToNotifications?: () => void;
  onOpenSendReminder?: (options?: { poNumber?: string; batchId?: string; recipientEmail?: string; item?: DiscrepancyItem }) => void;
  onOpenPdfReport?: (batch: InvoiceBatch) => void;
  onResyncWithTimesheets?: (batchId?: string) => void;
}

export const VendorPortal: React.FC<VendorPortalProps> = ({
  currentUser,
  currentCurrency,
  timesheets,
  currentBatch,
  batches = [],
  onBatchUpdated,
  onInitiateApproval,
  onOpenAribaCertificate,
  onCorrectLineItem,
  onNavigateToManager,
  onNavigateToNotifications,
  onOpenSendReminder,
  onOpenPdfReport,
  onResyncWithTimesheets
}) => {
  const [selectedPo, setSelectedPo] = useState<string>('PO-AB-2026-8941');
  const [billingMonth, setBillingMonth] = useState<string>('2026-08');
  const [filterMode, setFilterMode] = useState<'all' | 'mismatch' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isResyncing, setIsResyncing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals for Correction and Discrepancy Warning
  const [itemToCorrect, setItemToCorrect] = useState<DiscrepancyItem | null>(null);
  const [revisedDays, setRevisedDays] = useState<number>(0);
  const [revisedRate, setRevisedRate] = useState<number>(0);
  const [revisionNotes, setRevisionNotes] = useState<string>('');
  const [showDiscrepancyWarningModal, setShowDiscrepancyWarningModal] = useState<boolean>(false);
  const [showApprovalInitiatedModal, setShowApprovalInitiatedModal] = useState<boolean>(false);
  const [showHistoricalTrends, setShowHistoricalTrends] = useState<boolean>(false);
  const [tableTab, setTableTab] = useState<'reconciliation' | 'ariba_gr'>('reconciliation');
  const [copiedAribaGr, setCopiedAribaGr] = useState<boolean>(false);

  const poInfo = ACTIVE_PURCHASE_ORDERS.find(po => po.poNumber === selectedPo) || ACTIVE_PURCHASE_ORDERS[0];

  const handleCopyVendorGrTable = () => {
    if (!currentBatch) return;
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
    const rows = currentBatch.items.map((item, idx) => {
      const finalDays = item.managerDecision 
        ? item.managerDecision.finalApprovedDays 
        : (item.internalApprovedDays ?? item.billedDays);
      const finalAmount = item.managerDecision 
        ? item.managerDecision.finalApprovedAmount 
        : +(finalDays * item.claimedDailyRate).toFixed(2);
      return [
        item.poLineItem || String((idx + 1) * 10).padStart(5, '0'),
        item.poNumber || currentBatch.poNumber,
        `${currentBatch.poNumber} (${currentBatch.vendorName})`,
        item.resourceName,
        item.resourceEmail,
        item.admSeniority || 'Senior',
        item.admRole || 'Cloud Consultant',
        item.locationCity || 'Chicago',
        'DAY',
        finalDays,
        item.claimedDailyRate,
        finalAmount,
        'Cleared for Ariba GR'
      ].join('\t');
    });
    navigator.clipboard.writeText([headers.join('\t'), ...rows].join('\n'));
    setCopiedAribaGr(true);
    setTimeout(() => setCopiedAribaGr(false), 2500);
  };

  const handleDownloadVendorGrCsv = () => {
    if (!currentBatch) return;
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
    const rows = currentBatch.items.map((item, idx) => {
      const finalDays = item.managerDecision 
        ? item.managerDecision.finalApprovedDays 
        : (item.internalApprovedDays ?? item.billedDays);
      const finalAmount = item.managerDecision 
        ? item.managerDecision.finalApprovedAmount 
        : +(finalDays * item.claimedDailyRate).toFixed(2);
      return [
        `"${item.poNumber || currentBatch.poNumber}"`,
        `"${item.poLineItem || String((idx + 1) * 10).padStart(5, '0')}"`,
        `"${currentBatch.poNumber} - ${currentBatch.vendorName}"`,
        `"${item.resourceName}"`,
        `"${item.resourceEmail}"`,
        `"${item.admSeniority || 'Senior'}"`,
        `"${item.admRole || 'Cloud Consultant'}"`,
        `"${item.locationCity || 'Chicago'}"`,
        `"${item.projectCode || 'PRJ-CORE'}"`,
        `"DAY"`,
        finalDays,
        item.billedDays,
        item.internalApprovedDays,
        item.claimedDailyRate,
        finalAmount,
        `"${currentCurrency}"`,
        `"CLEARED_FOR_ARIBA_GR"`
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ariba_Goods_Receipt_Quantities_${currentBatch.poNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setUploadSuccessMessage(null);

      const parsedRows = await parseExcelFile(file, currentCurrency);
      if (!parsedRows || parsedRows.length === 0) {
        throw new Error('No valid invoice rows found in file. Please ensure columns match the required template.');
      }

      // Auto-detect PO Number and billing month from file if available
      const detectedPo = parsedRows[0]?.poNumber || selectedPo;
      const detectedMonth = parsedRows[0]?.billingMonth || billingMonth;
      if (detectedPo && detectedPo !== selectedPo) {
        setSelectedPo(detectedPo);
      }
      if (detectedMonth && detectedMonth !== billingMonth) {
        setBillingMonth(detectedMonth);
      }

      const batch = reconcileInvoiceRows(
        parsedRows,
        timesheets,
        currentUser.vendorName || poInfo.vendorName,
        currentUser.email,
        detectedPo,
        detectedMonth,
        file.name
      );

      // Check for existing batch for same PO & billing month to manage revisions and duplicates
      const duplicateBatch = batches.find(
        b => b.poNumber === detectedPo && b.billingMonth === detectedMonth
      );
      if (duplicateBatch) {
        batch.isRevision = true;
        batch.revisionNumber = (duplicateBatch.revisionNumber || 1) + 1;
        batch.duplicateOfBatchId = duplicateBatch.id;
        batch.duplicateWarning = `Revision v${batch.revisionNumber}: Supersedes previous batch submission (${duplicateBatch.batchNumber || duplicateBatch.id.slice(0, 8)})`;
      }

      onBatchUpdated(batch);
      setUploadSuccessMessage(
        `Successfully processed "${file.name}" (${parsedRows.length} line items)! Found ${batch.matchedItemsCount} perfect matches and ${batch.discrepancyItemsCount} discrepancies.`
      );
      setTimeout(() => setUploadSuccessMessage(null), 8000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process the uploaded file. Please check file format.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTriggerResync = () => {
    if (!onResyncWithTimesheets) return;
    setIsResyncing(true);
    setUploadSuccessMessage(null);
    try {
      onResyncWithTimesheets(currentBatch?.id);
      setUploadSuccessMessage('Re-synchronized invoice items against latest internal timesheets successfully.');
      setTimeout(() => setUploadSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to re-sync timesheets.');
    } finally {
      setTimeout(() => setIsResyncing(false), 500);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleLoadSampleData = () => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      const sampleRows = SAMPLE_VENDOR_INVOICE_ROWS[selectedPo] || SAMPLE_VENDOR_INVOICE_ROWS['PO-AB-2026-8941'];
      const batch = reconcileInvoiceRows(
        sampleRows,
        timesheets,
        currentUser.vendorName || poInfo.vendorName,
        currentUser.email,
        selectedPo,
        billingMonth,
        'Apex_Consulting_Invoice_August2026.xlsx'
      );

      // Check for existing batch for same PO & billing month to manage revisions and duplicates
      const duplicateBatch = batches.find(
        b => b.poNumber === selectedPo && b.billingMonth === billingMonth
      );
      if (duplicateBatch) {
        batch.isRevision = true;
        batch.revisionNumber = (duplicateBatch.revisionNumber || 1) + 1;
        batch.duplicateOfBatchId = duplicateBatch.id;
        batch.duplicateWarning = `Revision v${batch.revisionNumber}: Supersedes previous batch submission (${duplicateBatch.batchNumber || duplicateBatch.id.slice(0, 8)})`;
      }

      onBatchUpdated(batch);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load sample data.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openCorrectionModal = (item: DiscrepancyItem) => {
    setItemToCorrect(item);
    // Suggest the approved internal days and contract rate as default correction
    setRevisedDays(item.internalApprovedDays > 0 ? item.internalApprovedDays : item.billedDays);
    setRevisedRate(item.contractDailyRate > 0 ? item.contractDailyRate : item.claimedDailyRate);
    setRevisionNotes(
      item.status === 'REJECTED_BY_MANAGER'
        ? `Adjusted billing to ${item.internalApprovedDays} days as instructed by manager.`
        : `Aligned billing with AB approved internal timesheet limit (${item.internalApprovedDays} days).`
    );
  };

  const submitLineCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToCorrect || !currentBatch) return;

    const isResubmission = itemToCorrect.status === 'REJECTED_BY_MANAGER';

    if (onCorrectLineItem) {
      onCorrectLineItem(
        currentBatch.id,
        itemToCorrect.id,
        revisedDays,
        revisedRate,
        revisionNotes || 'Vendor adjusted invoice to match internal timesheet.',
        isResubmission
      );
    } else {
      // Inline fallback if handler not passed
      const updatedItems = currentBatch.items.map(it => {
        if (it.id !== itemToCorrect.id) return it;

        const billedAmount = revisedDays * revisedRate;
        const internalAmount = it.internalApprovedDays * it.contractDailyRate;
        const daysDiff = revisedDays - it.internalApprovedDays;
        const rateDiff = revisedRate - it.contractDailyRate;
        const isMatched = Math.abs(daysDiff) < 0.01 && Math.abs(rateDiff) < 0.01;

        return {
          ...it,
          billedDays: revisedDays,
          claimedDailyRate: revisedRate,
          billedTotalAmount: billedAmount,
          daysVariance: daysDiff,
          financialVarianceAmount: billedAmount - internalAmount,
          discrepancyType: isMatched ? 'PERFECT_MATCH' : it.discrepancyType,
          status: isResubmission 
            ? 'RESUBMITTED_FOR_REVIEW' 
            : isMatched 
            ? 'AUTO_MATCHED' 
            : it.status,
          vendorCorrection: {
            correctedAt: new Date().toISOString(),
            originalBilledDays: it.billedDays,
            originalRate: it.claimedDailyRate,
            newBilledDays: revisedDays,
            newRate: revisedRate,
            notes: revisionNotes
          }
        } as DiscrepancyItem;
      });

      const updatedBatch: InvoiceBatch = {
        ...currentBatch,
        items: updatedItems,
        matchedItemsCount: updatedItems.filter(i => i.discrepancyType === 'PERFECT_MATCH').length,
        discrepancyItemsCount: updatedItems.filter(i => i.discrepancyType !== 'PERFECT_MATCH').length,
        totalBilledAmount: updatedItems.reduce((sum, i) => sum + i.billedTotalAmount, 0),
        netVarianceAmount: updatedItems.reduce((sum, i) => sum + i.financialVarianceAmount, 0),
        status: isResubmission ? 'IN_REVIEW' : currentBatch.status
      };

      onBatchUpdated(updatedBatch);
    }

    setItemToCorrect(null);
  };

  const handleInitiateApprovalClick = () => {
    if (!currentBatch) return;

    // Check if uncorrected discrepancies exist
    const uncorrectedCount = currentBatch.items.filter(
      i => i.discrepancyType !== 'PERFECT_MATCH' && !i.managerDecision
    ).length;

    if (uncorrectedCount > 0) {
      setShowDiscrepancyWarningModal(true);
    } else {
      onInitiateApproval(currentBatch);
      setShowApprovalInitiatedModal(true);
    }
  };

  const filteredItems = currentBatch?.items.filter(item => {
    if (filterMode === 'matched' && item.discrepancyType !== 'PERFECT_MATCH') return false;
    if (filterMode === 'mismatch' && item.discrepancyType === 'PERFECT_MATCH') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.resourceEmail.toLowerCase().includes(q) ||
        item.resourceName.toLowerCase().includes(q) ||
        item.managerName.toLowerCase().includes(q)
      );
    }
    return true;
  }) || [];

  const rejectedItems = currentBatch?.items.filter(i => i.status === 'REJECTED_BY_MANAGER') || [];

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Vendor Invoice / Timesheet Upload - Always Mounted in DOM */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />
      
      {/* Rejection Notification Banner if any line was rejected by manager */}
      {rejectedItems.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0 mt-0.5">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-700 uppercase tracking-wider">
                  Manager Rejection Action Required
                </span>
                <span className="text-[10px] bg-red-200 text-red-900 font-bold px-1.5 py-0.5 rounded">
                  {rejectedItems.length} Line Item{rejectedItems.length > 1 ? 's' : ''} Rejected
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                Resource Manager Rejected Line Data — Revision Required for Ariba Clearance
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                One or more invoice lines were rejected during review. SAP Ariba Pre-Invoice Clearance is strictly held until you correct the billed days/rates and resubmit for manager authorization.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (rejectedItems[0]) openCorrectionModal(rejectedItems[0]);
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors shrink-0 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Correct Rejected Line ({rejectedItems[0]?.resourceName})</span>
          </button>
        </div>
      )}

      {/* Top Configuration & Upload Controls Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full font-bold border border-blue-100 uppercase">
                Vendor Portal (RBAC: Vendor Access)
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {currentUser.vendorName || 'Apex Global Solutions'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-1">
              Pre-Invoice Clearance & Reconciliation
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Submit vendor invoice data with PO line items. Automatically reconciled against central internal timesheets using <span className="font-semibold text-slate-700">Resource Email ID & PO Number</span>.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="download-template-btn"
              onClick={() => downloadVendorInvoiceTemplate(selectedPo, currentCurrency)}
              className="text-xs px-3.5 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Download standard vendor invoice Excel template with all required columns"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download Excel Template</span>
            </button>

            <button
              id="vendor-reupload-top-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="text-xs px-3.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg font-medium text-indigo-800 hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Upload or re-upload vendor invoice/timesheet spreadsheet (.xlsx, .xls, .csv)"
            >
              <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isProcessing ? 'Processing File...' : currentBatch ? 'Re-Upload Timesheet' : 'Upload Timesheet'}</span>
            </button>

            {onResyncWithTimesheets && (
              <button
                id="vendor-resync-top-btn"
                onClick={handleTriggerResync}
                disabled={isResyncing}
                className="text-xs px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-lg font-medium text-emerald-800 hover:bg-emerald-100 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Re-verify all items against latest approved Timesheet records"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isResyncing ? 'animate-spin' : ''}`} />
                <span>{isResyncing ? 'Re-Syncing...' : 'Re-Sync Timesheets'}</span>
              </button>
            )}

            <button
              id="vendor-toggle-trends-btn"
              onClick={() => setShowHistoricalTrends(!showHistoricalTrends)}
              className={`text-xs px-3.5 py-2 rounded-lg font-medium transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                showHistoricalTrends
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{showHistoricalTrends ? 'Hide Trends' : 'Historical Trends'}</span>
            </button>

            <button
              id="load-sample-data-btn"
              onClick={handleLoadSampleData}
              disabled={isProcessing}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-200" />
              <span>Load Sample Vendor Data</span>
            </button>
          </div>
        </div>

        {/* Success Feedback Alert */}
        {uploadSuccessMessage && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{uploadSuccessMessage}</span>
          </div>
        )}

        {/* Error Feedback Alert */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* PO & Billing Period Selectors */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Target Purchase Order (PO)
            </label>
            <select
              id="vendor-po-select"
              value={selectedPo}
              onChange={(e) => setSelectedPo(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
            >
              {ACTIVE_PURCHASE_ORDERS.map(po => (
                <option key={po.poNumber} value={po.poNumber}>
                  {po.poNumber} - {po.vendorName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Billing Month
            </label>
            <select
              id="billing-month-select"
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
            >
              <option value="2026-08">August 2026 (Active Period)</option>
              <option value="2026-07">July 2026 (Historical)</option>
              <option value="2026-09">September 2026 (Upcoming)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Scope & Budget Allocation
            </label>
            <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 truncate font-medium">
              {poInfo.department} (Cap: {formatCurrency(poInfo.budgetAllocated, currentCurrency)})
            </div>
          </div>
        </div>
      </div>

      {/* Historical Trend Analysis View */}
      {showHistoricalTrends && (
        <HistoricalTrendView
          batches={batches && batches.length > 0 ? batches : (currentBatch ? [currentBatch] : [])}
          currentCurrency={currentCurrency}
          initialVendorFilter={currentUser.vendorName || 'Apex Global Solutions'}
          onOpenPdfReport={onOpenPdfReport}
        />
      )}

      {/* Dashboard Summary Chart (Recharts) */}
      <InvoiceStatusChart
        batches={batches.length > 0 ? batches : (currentBatch ? [currentBatch] : [])}
        currentCurrency={currentCurrency}
        portalType="vendor"
        vendorEmail={currentUser.email}
        selectedMonth={billingMonth}
        onMonthChange={(m) => {
          if (m !== 'ALL') setBillingMonth(m);
        }}
        onOpenPdfReport={onOpenPdfReport}
      />

      {/* Upload Zone (If no batch loaded) */}
      {!currentBatch && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            dragOver 
              ? 'border-blue-500 bg-blue-50/50' 
              : 'border-slate-300 bg-white hover:border-slate-400 shadow-sm'
          }`}
        >
          <div className="mx-auto w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-2xs">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">
            Click to upload or drag & drop vendor invoice Excel / CSV
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
            Input columns recognized: <span className="font-mono text-slate-700 font-semibold">Purchase Order Number, PO Line Item, Resource Email ID, ADM Seniority, ADM Role, Resource Location (City), Billed Days, Daily Rate</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-[11px] font-medium border border-blue-100">
              <FileSpreadsheet className="w-3 h-3 text-blue-600" />
              <span>Ariba 3-Way GR Ready</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[11px] font-medium border border-emerald-100">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>PO Line Item Level Matching</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-md text-[11px] text-slate-700 font-medium">
              <span>Local Currency: {currentCurrency}</span>
            </span>
          </div>
        </div>
      )}

      {/* Compact Drag & Drop Re-Upload Zone (When a batch is already active) */}
      {currentBatch && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-all flex items-center justify-center gap-2 text-xs ${
            dragOver 
              ? 'border-indigo-500 bg-indigo-50/60 text-indigo-800 font-medium' 
              : 'border-slate-300 bg-slate-50/70 hover:bg-slate-100/70 text-slate-600'
          }`}
          title="Drag and drop a revised invoice spreadsheet here or click to select file"
        >
          <UploadCloud className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>Need to replace or update this batch? <strong>Drag & drop revised Excel / CSV here</strong> or click to <strong>Re-Upload Timesheet</strong>.</span>
        </div>
      )}

      {/* Sleek 4-Column KPI Grid */}
      {currentBatch && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Card 1: Submitted Invoices */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Submitted Invoices
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {currentBatch.totalLineItems}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">
                Current Billing Cycle ({currentBatch.billingMonth})
              </p>
            </div>

            {/* Card 2: Auto-Matched with Progress Bar */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Auto-Matched
              </p>
              <p className="text-2xl font-bold text-emerald-600">
                {currentBatch.matchedItemsCount}
              </p>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${currentBatch.totalLineItems > 0 ? (currentBatch.matchedItemsCount / currentBatch.totalLineItems) * 100 : 0}%` 
                  }}
                />
              </div>
            </div>

            {/* Card 3: Discrepancies */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Discrepancies
              </p>
              <p className="text-2xl font-bold text-red-600">
                {currentBatch.discrepancyItemsCount}
              </p>
              <p 
                onClick={() => setFilterMode('mismatch')}
                className="text-[10px] text-red-500 mt-2 underline cursor-pointer font-medium"
              >
                Review Pending Actions ({formatCurrency(currentBatch.netVarianceAmount, currentCurrency)} variance)
              </p>
            </div>

            {/* Card 4: Ready for Ariba */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Ready for Ariba
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {currentBatch.status === 'CLEARED_FOR_ARIBA' || currentBatch.discrepancyItemsCount === 0
                  ? currentBatch.totalLineItems
                  : currentBatch.matchedItemsCount}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">
                {currentBatch.status === 'CLEARED_FOR_ARIBA' || currentBatch.discrepancyItemsCount === 0
                  ? 'Approved for Submission'
                  : 'Pending Approval Sign-Off'}
              </p>
            </div>

          </div>

          {/* Workflow & Decision Banner */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {currentBatch.discrepancyItemsCount > 0 ? (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-bold border border-red-200 uppercase">
                    {currentBatch.discrepancyItemsCount} Discrepancies Flagged
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded-full font-bold border border-emerald-100 uppercase">
                    100% Cleared
                  </span>
                )}
                <span className="text-xs font-bold text-slate-800">
                  Pre-Invoice Clearance Status: {currentBatch.status}
                </span>
                {currentBatch.status === 'REJECTED_NEEDS_REVISION' && (
                  <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] rounded-full font-bold uppercase">
                    Revision Required
                  </span>
                )}
                {currentBatch.isRevision && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full font-bold border border-amber-200 uppercase flex items-center gap-1">
                    <Layers className="w-2.5 h-2.5" />
                    <span>Revision v{currentBatch.revisionNumber || 2}</span>
                  </span>
                )}
                {currentBatch.duplicateWarning && (
                  <span className="text-[10px] text-amber-700 font-medium">
                    ({currentBatch.duplicateWarning})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 max-w-2xl">
                {currentBatch.discrepancyItemsCount > 0
                  ? 'Vendors are expected to correct discrepancies to match approved internal timesheets before triggering approval. All lines (matches + exceptions) will be submitted for manager sign-off.'
                  : 'All consultant days and rates match internal timesheets. Generate your official Ariba Pre-Invoice Clearance Certificate (PICC) below.'}
              </p>
              {currentBatch.approvalFlowInitiated && (
                <div className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Approval workflow active for all resources. Alert notifications sent to respective AB Company resource managers.</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {onResyncWithTimesheets && (
                <button
                  id="vendor-resync-workflow-btn"
                  onClick={() => onResyncWithTimesheets(currentBatch.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 shadow-xs"
                  title="Retroactive Timesheet Diff: Refresh this batch against latest records and approvals in Timesheet Database"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-Sync Timesheets</span>
                </button>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3.5 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Upload Revised File</span>
              </button>

              {(!currentBatch.approvalFlowInitiated || currentBatch.status === 'REJECTED_NEEDS_REVISION') && (
                <button
                  id="initiate-approval-btn"
                  onClick={handleInitiateApprovalClick}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                  <span>Trigger Approval Flow (All Lines)</span>
                </button>
              )}

              {onOpenSendReminder && (
                <button
                  id="vendor-nudge-managers-btn"
                  onClick={() => onOpenSendReminder({ poNumber: currentBatch.poNumber, batchId: currentBatch.id })}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 shadow-xs"
                  title="Send a prioritized reminder to resource managers to review pending timesheets"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Nudge Managers</span>
                </button>
              )}

              {onOpenPdfReport && (
                <button
                  id="vendor-export-pdf-report-btn"
                  onClick={() => onOpenPdfReport(currentBatch)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 shadow-xs"
                  title="Export Current Invoice Batch Summary and Pre-Invoice Clearance Certificate as a Printable PDF Report"
                >
                  <Printer className="w-3.5 h-3.5 text-white" />
                  <span>Printable Audit PDF</span>
                </button>
              )}

              <button
                id="view-clearance-certificate-btn"
                onClick={() => onOpenAribaCertificate(currentBatch)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-slate-300" />
                <span>Ariba Clearance Certificate</span>
              </button>
            </div>
          </div>

          {/* Sleek Reconciliations & Ariba GR Table Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            
            {/* Table Navigation Tabs */}
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 pt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  id="tab-recon-lines"
                  onClick={() => setTableTab('reconciliation')}
                  className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                    tableTab === 'reconciliation'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Invoice Lines & Reconciliation</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono">
                    {currentBatch.totalLineItems}
                  </span>
                </button>

                <button
                  id="tab-ariba-gr-summary"
                  onClick={() => setTableTab('ariba_gr')}
                  className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                    tableTab === 'ariba_gr'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Table className="w-3.5 h-3.5 text-emerald-600" />
                  <span>SAP Ariba Goods Receipt (GR) Summary</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    Ariba 3-Way Ready
                  </span>
                </button>
              </div>

              {tableTab === 'ariba_gr' && (
                <div className="pb-2.5 flex items-center gap-2">
                  <button
                    onClick={handleCopyVendorGrTable}
                    className="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    title="Copy Ariba Goods Receipt Line-Item Summary to Clipboard for Excel paste"
                  >
                    {copiedAribaGr ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{copiedAribaGr ? 'Copied to Clipboard!' : 'Copy Summary'}</span>
                  </button>

                  <button
                    onClick={handleDownloadVendorGrCsv}
                    className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    title="Download CSV formatted for SAP Ariba Goods Receipt"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export GR CSV</span>
                  </button>
                </div>
              )}
            </div>

            {/* Table View 1: Reconciliation Lines */}
            {tableTab === 'reconciliation' && (
              <>
                {/* Table Toolbar */}
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-3">
                  <div>
                    <h2 className="font-bold text-slate-800 text-sm">Invoice Line Items & Reconciliation Status</h2>
                    <span className="text-[11px] text-slate-500">
                      Showing {filteredItems.length} of {currentBatch.totalLineItems} consultant lines • Email is primary identifier
                    </span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter by Resource Email..."
                        className="text-xs px-3 py-1.5 pl-8 border border-slate-200 rounded-lg w-full bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    </div>

                    <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
                      <button
                        onClick={() => setFilterMode('all')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                          filterMode === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilterMode('mismatch')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                          filterMode === 'mismatch' ? 'bg-red-500 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Discrepancies ({currentBatch.discrepancyItemsCount})
                      </button>
                      <button
                        onClick={() => setFilterMode('matched')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                          filterMode === 'matched' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Matched ({currentBatch.matchedItemsCount})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table Content */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-4">PO Line & Resource</th>
                        <th className="px-5 py-4">ADM Role & City</th>
                        <th className="px-5 py-4 text-center">Internal Approved</th>
                        <th className="px-5 py-4 text-center">Invoice Claimed</th>
                        <th className="px-5 py-4">Variance Exposure</th>
                        <th className="px-5 py-4">Approval Status</th>
                        <th className="px-5 py-4 text-right">Vendor Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                      {filteredItems.map((item, idx) => {
                        const isMismatch = item.discrepancyType !== 'PERFECT_MATCH';
                        const isOverbilled = item.discrepancyType === 'DAYS_OVERBILLED';
                        const isUnderbilled = item.discrepancyType === 'DAYS_UNDERBILLED';
                        const isRejected = item.status === 'REJECTED_BY_MANAGER';
                        const isResubmitted = item.status === 'RESUBMITTED_FOR_REVIEW';
                        const poLineItem = item.poLineItem || String((idx + 1) * 10).padStart(5, '0');

                        return (
                          <tr 
                            key={item.id}
                            className={`transition-colors ${
                              isRejected
                                ? 'bg-red-100/50 border-l-4 border-red-600'
                                : isResubmitted
                                ? 'bg-purple-50/40 border-l-4 border-purple-500'
                                : isOverbilled 
                                ? 'bg-red-50/30 hover:bg-red-50/50' 
                                : isUnderbilled 
                                ? 'bg-amber-50/30 hover:bg-amber-50/50' 
                                : isMismatch
                                ? 'bg-purple-50/20 hover:bg-purple-50/40'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* PO Line & Resource */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  Line {poLineItem}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {item.poNumber || currentBatch.poNumber}
                                </span>
                              </div>
                              <div className="font-medium text-slate-800">{item.resourceEmail}</div>
                              <div className="text-xs text-slate-500 font-medium">{item.resourceName}</div>
                              {item.vendorCorrection && (
                                <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                                  ✓ Corrected by Vendor (was {item.vendorCorrection.originalBilledDays} days)
                                </div>
                              )}
                              {isRejected && item.managerDecision && (
                                <div className="mt-1 text-[11px] text-red-700 bg-red-100/80 p-1.5 rounded border border-red-200">
                                  <strong className="block text-red-800">Manager Rejection Rationale ({item.managerDecision.decidedByName}):</strong>
                                  "{item.managerDecision.justificationNotes}"
                                </div>
                              )}
                            </td>

                            {/* ADM Role, Seniority, Location */}
                            <td className="px-5 py-4">
                              <div className="font-medium text-slate-700 text-xs">{item.admRole || 'Cloud Consultant'}</div>
                              <div className="text-[11px] text-slate-500">{item.admSeniority || 'Senior'}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">📍 {item.locationCity || 'Chicago'}</div>
                            </td>

                            {/* Internal Approved Days */}
                            <td className="px-5 py-4 text-center font-medium text-slate-700">
                              {item.internalApprovedDays > 0 ? (
                                <div>
                                  <span>{item.internalApprovedDays.toFixed(1)} Days</span>
                                  <div className="text-[10px] text-slate-400">
                                    @ {formatCurrency(item.contractDailyRate, currentCurrency)}/day
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Unmapped</span>
                              )}
                            </td>

                            {/* Billed Days */}
                            <td className="px-5 py-4 text-center font-bold text-slate-900">
                              <div>
                                <span className={item.daysVariance !== 0 ? 'text-red-600' : 'text-slate-900'}>
                                  {item.billedDays.toFixed(1)} Days
                                </span>
                                <div className="text-[10px] text-slate-500 font-normal">
                                  @ {formatCurrency(item.claimedDailyRate, currentCurrency)}/day
                                </div>
                              </div>
                            </td>

                            {/* Variance */}
                            <td className="px-5 py-4">
                              {item.daysVariance === 0 && item.claimedDailyRate === item.contractDailyRate && (
                                <span className="text-emerald-600 font-semibold text-xs">
                                  0.0 (Perfect Match)
                                </span>
                              )}
                              {item.daysVariance > 0 && (
                                <div className="space-y-0.5">
                                  <span className="text-red-600 font-semibold text-xs block">
                                    +{item.daysVariance.toFixed(1)} Days ({formatCurrency(item.financialVarianceAmount, currentCurrency)})
                                  </span>
                                  <span className="text-[10px] text-red-500 block">Exceeds timesheet</span>
                                </div>
                              )}
                              {item.daysVariance < 0 && (
                                <span className="text-amber-600 font-semibold text-xs">
                                  {item.daysVariance.toFixed(1)} Days (Underbilled)
                                </span>
                              )}
                              {item.discrepancyType === 'RESOURCE_NOT_FOUND' && (
                                <span className="text-purple-600 font-semibold text-xs">
                                  Not Found in Internal DB
                                </span>
                              )}
                              {item.discrepancyType === 'RATE_MISMATCH' && (
                                <span className="text-amber-600 font-semibold text-xs">
                                  Rate Variance ({formatCurrency(item.claimedDailyRate, currentCurrency)} vs {formatCurrency(item.contractDailyRate, currentCurrency)})
                                </span>
                              )}
                            </td>

                            {/* Status Badge */}
                            <td className="px-5 py-4">
                              {isRejected ? (
                                <span className="px-2 py-1 bg-red-600 text-white text-[10px] rounded-full font-bold uppercase shadow-2xs inline-flex items-center gap-1">
                                  <XCircle className="w-3 h-3" />
                                  <span>Rejected by Manager</span>
                                </span>
                              ) : isResubmitted ? (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-[10px] rounded-full font-bold border border-purple-200 uppercase">
                                  Resubmitted for Review
                                </span>
                              ) : item.discrepancyType === 'PERFECT_MATCH' ? (
                                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] rounded-full font-bold border border-emerald-100 uppercase">
                                  Matched
                                </span>
                              ) : item.managerDecision ? (
                                <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] rounded-full font-bold border border-blue-200 uppercase">
                                  Resolved ({item.managerDecision.action === 'APPROVE_VARIANCE' ? 'Exception' : 'Adjusted'})
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] rounded-full font-bold border border-red-200 uppercase">
                                  Discrepancy
                                </span>
                              )}
                            </td>

                            {/* Vendor Action */}
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isRejected ? (
                                  <button
                                    onClick={() => openCorrectionModal(item)}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Correct & Resubmit</span>
                                  </button>
                                ) : isMismatch && !item.managerDecision ? (
                                  <>
                                    <button
                                      onClick={() => openCorrectionModal(item)}
                                      className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-blue-600 text-xs font-semibold rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3 text-blue-500" />
                                      <span>Correct Line</span>
                                    </button>

                                    {onOpenSendReminder && currentBatch.approvalFlowInitiated && (
                                      <button
                                        onClick={() => onOpenSendReminder({ 
                                          poNumber: currentBatch.poNumber, 
                                          batchId: currentBatch.id, 
                                          item 
                                        })}
                                        className="p-1 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                                        title={`Nudge manager for ${item.resourceName}`}
                                      >
                                        <BellRing className="w-3 h-3 text-amber-600" />
                                        <span>Nudge</span>
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-slate-400 italic text-xs">
                                    {item.managerDecision ? 'Signed Off' : 'Routine'}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Table Summary */}
                <div className="p-3.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
                  <span>Financial Variance Exposure: <strong className="text-slate-800">{formatCurrency(currentBatch.netVarianceAmount, currentCurrency)}</strong></span>
                  <span className="font-mono">AB Company Invoicing Engine • Pre-Invoice Clearance</span>
                </div>
              </>
            )}

            {/* Table View 2: SAP Ariba Goods Receipt (GR) Line-Item Summary */}
            {tableTab === 'ariba_gr' && (
              <div className="p-5 space-y-4">
                {/* Information Header Box */}
                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-950">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <span>Ariba Goods Receipt (GR) 3-Way Match Schedule</span>
                        <span className="px-2 py-0.5 bg-emerald-200/70 text-emerald-900 rounded font-bold text-[10px]">
                          Zero-Variance Cleared
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed">
                        This summary table details <strong>Purchase Order</strong>, <strong>PO Number</strong>, <strong>PO Line Item</strong>, and the <strong>Total Number of Days per Line Item</strong> required for entering Goods Receipt in SAP Ariba when submitting actual commercial invoices.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onOpenAribaCertificate(currentBatch)}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>View Clearance Certificate</span>
                    </button>
                  </div>
                </div>

                {/* The Ariba GR Summary Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-3.5 py-3">PO Line Item</th>
                        <th className="px-3.5 py-3">Purchase Order Number</th>
                        <th className="px-3.5 py-3">Consultant / Resource</th>
                        <th className="px-3.5 py-3">ADM Role & Seniority</th>
                        <th className="px-3.5 py-3">Resource Location (City)</th>
                        <th className="px-2.5 py-3 text-center">UOM</th>
                        <th className="px-4 py-3 text-center bg-emerald-700 text-white font-black">
                          Total Number of Days
                        </th>
                        <th className="px-3 py-3 text-right">Daily Rate</th>
                        <th className="px-3.5 py-3 text-right">Total GR Value</th>
                        <th className="px-3 py-3 text-center">Ariba Match</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-100 bg-white">
                      {currentBatch.items.map((item, idx) => {
                        const finalDays = item.managerDecision 
                          ? item.managerDecision.finalApprovedDays 
                          : (item.internalApprovedDays ?? item.billedDays);
                        const finalAmount = item.managerDecision 
                          ? item.managerDecision.finalApprovedAmount 
                          : +(finalDays * item.claimedDailyRate).toFixed(2);
                        const poLineItem = item.poLineItem || String((idx + 1) * 10).padStart(5, '0');
                        const poNumber = item.poNumber || currentBatch.poNumber;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3.5 py-3 font-mono font-bold text-blue-700">
                              <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded">
                                {poLineItem}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 font-mono font-bold text-slate-800">
                              <div>{poNumber}</div>
                              <div className="text-[10px] font-sans text-slate-500 font-normal">
                                {currentBatch.vendorName}
                              </div>
                            </td>
                            <td className="px-3.5 py-3 text-slate-900">
                              <div className="font-bold">{item.resourceName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{item.resourceEmail}</div>
                            </td>
                            <td className="px-3.5 py-3 text-slate-700">
                              <div className="font-semibold text-slate-800">{item.admRole || 'Cloud Consultant'}</div>
                              <div className="text-[10px] text-slate-500">{item.admSeniority || 'Senior'}</div>
                            </td>
                            <td className="px-3.5 py-3 text-slate-700 font-medium">
                              📍 {item.locationCity || 'Chicago'}
                            </td>
                            <td className="px-2.5 py-3 text-center font-mono font-bold text-slate-600">
                              DAY
                            </td>
                            <td className="px-4 py-3 text-center bg-emerald-50/70 border-x border-emerald-100">
                              <span className="font-black text-emerald-800 text-sm font-mono block">
                                {finalDays.toFixed(1)} Days
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                (Claim: {item.billedDays}d | TS: {item.internalApprovedDays}d)
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-600">
                              {formatCurrency(item.claimedDailyRate, currentCurrency)}
                            </td>
                            <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(finalAmount, currentCurrency)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Ready for GR</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-right uppercase text-[11px] text-slate-600">
                          Total Cleared for Ariba Goods Receipt ({currentBatch.items.length} Line Items):
                        </td>
                        <td className="px-4 py-3 text-center bg-emerald-100 text-emerald-900 text-sm font-black border-x border-emerald-200">
                          {currentBatch.items.reduce((sum, item) => {
                            const d = item.managerDecision 
                              ? item.managerDecision.finalApprovedDays 
                              : (item.internalApprovedDays ?? item.billedDays);
                            return sum + d;
                          }, 0).toFixed(1)} Days
                        </td>
                        <td className="px-3 py-3 text-right text-slate-400 text-[10px]">
                          Avg Rate
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono text-sm text-slate-900 font-extrabold">
                          {formatCurrency(
                            currentBatch.items.reduce((sum, item) => {
                              const d = item.managerDecision 
                                ? item.managerDecision.finalApprovedDays 
                                : (item.internalApprovedDays ?? item.billedDays);
                              const a = item.managerDecision 
                                ? item.managerDecision.finalApprovedAmount 
                                : +(d * item.claimedDailyRate).toFixed(2);
                              return sum + a;
                            }, 0),
                            currentCurrency
                          )}
                        </td>
                        <td className="px-3 py-3 text-center text-emerald-700 text-[11px]">
                          ✓ 100% Cleared
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-1">
                  <span>Standard UOM: <strong>DAY (Full Consultant Days)</strong> • SAP Ariba Material/Service Item Category: <strong>D (Service)</strong></span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyVendorGrTable}
                      className="hover:text-blue-700 underline font-medium cursor-pointer inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy for SAP Ariba</span>
                    </button>
                    <span>•</span>
                    <button
                      onClick={handleDownloadVendorGrCsv}
                      className="hover:text-blue-700 underline font-medium cursor-pointer inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download CSV</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* Discrepancy Correction Modal */}
      {itemToCorrect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">
                  {itemToCorrect.status === 'REJECTED_BY_MANAGER' ? 'Correct & Resubmit Rejected Line' : 'Correct Invoice Discrepancy Line'}
                </h3>
              </div>
              <button
                onClick={() => setItemToCorrect(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitLineCorrection} className="p-6 space-y-4 text-xs">
              
              {/* Alert if rejected by manager */}
              {itemToCorrect.status === 'REJECTED_BY_MANAGER' && itemToCorrect.managerDecision && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-1 text-red-800">
                  <div className="flex items-center gap-1.5 font-bold text-red-900">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span>Manager Rejection Note:</span>
                  </div>
                  <p className="text-slate-700 italic">
                    "{itemToCorrect.managerDecision.justificationNotes}"
                  </p>
                  <p className="text-[10px] text-red-600 mt-1">
                    Please adjust the billed days or rate to comply with the manager's decision before resubmitting.
                  </p>
                </div>
              )}

              {/* Resource Info */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 text-sm">{itemToCorrect.resourceName}</div>
                <div className="text-slate-500 font-mono">{itemToCorrect.resourceEmail}</div>
                <div className="text-[11px] text-slate-600 pt-1 flex justify-between border-t border-slate-200/60 mt-2">
                  <span>Internal Approved Limit:</span>
                  <span className="font-bold text-emerald-700">
                    {itemToCorrect.internalApprovedDays.toFixed(1)} Days @ {formatCurrency(itemToCorrect.contractDailyRate, currentCurrency)}
                  </span>
                </div>
              </div>

              {/* Input: Billed Days */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Corrected Billed Days:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="31"
                    value={revisedDays}
                    onChange={(e) => setRevisedDays(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                    required
                  />
                  {itemToCorrect.internalApprovedDays > 0 && (
                    <button
                      type="button"
                      onClick={() => setRevisedDays(itemToCorrect.internalApprovedDays)}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold whitespace-nowrap"
                      title="Set to Approved Limit"
                    >
                      Align ({itemToCorrect.internalApprovedDays}d)
                    </button>
                  )}
                </div>
              </div>

              {/* Input: Daily Rate */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Daily Rate ({currentCurrency}):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={revisedRate}
                    onChange={(e) => setRevisedRate(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                    required
                  />
                  {itemToCorrect.contractDailyRate > 0 && (
                    <button
                      type="button"
                      onClick={() => setRevisedRate(itemToCorrect.contractDailyRate)}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold whitespace-nowrap"
                      title="Set to Contract Rate"
                    >
                      Contract ({formatCurrency(itemToCorrect.contractDailyRate, currentCurrency)})
                    </button>
                  )}
                </div>
              </div>

              {/* Input: Vendor Revision Note */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Vendor Correction / Audit Note:
                </label>
                <textarea
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  rows={2}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                  placeholder="Explain the correction for the manager and audit log..."
                  required
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemToCorrect(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs transition-colors"
                >
                  {itemToCorrect.status === 'REJECTED_BY_MANAGER' ? 'Submit Revision for Manager Re-Approval' : 'Save Correction'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Discrepancy Warning Before Approval Modal */}
      {showDiscrepancyWarningModal && currentBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Notice: Discrepancy Correction Expected
                </h3>
                <p className="text-xs text-amber-800">
                  {currentBatch.discrepancyItemsCount} uncorrected discrepancies detected
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                Under the AB Company Procurement Rules, <strong>vendors are expected to correct discrepancies to match internal approved timesheets</strong> before triggering the approval flow.
              </p>
              <p>
                If you proceed now, the approval flow will be triggered for <strong>all resources (both matches and discrepancies)</strong>. Any uncorrected discrepancy lines will be sent to the respective managers as variance exception requests with a risk of rejection.
              </p>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800">Recommended Action:</span>
                <p className="text-[11px] text-slate-500">
                  Click "Review & Correct First" to adjust your claimed days to the internal approved limits in one click.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-2 text-xs">
              <button
                onClick={() => setShowDiscrepancyWarningModal(false)}
                className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-bold rounded-lg shadow-2xs"
              >
                Review & Correct First
              </button>
              <button
                onClick={() => {
                  setShowDiscrepancyWarningModal(false);
                  onInitiateApproval(currentBatch);
                  setShowApprovalInitiatedModal(true);
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs"
              >
                Trigger Approval for All Lines Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Flow Dispatched Confirmation Modal */}
      {showApprovalInitiatedModal && currentBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <CheckCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Approval Flow Dispatched</h3>
                  <p className="text-xs text-emerald-100">
                    Notifications sent to resource managers
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowApprovalInitiatedModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span>PO: {currentBatch.poNumber}</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">
                    Status: IN_REVIEW
                  </span>
                </div>
                <p>
                  Approval workflow is active for all <strong>{currentBatch.items.length} consultant lines</strong> ({currentBatch.matchedItemsCount} routine matches + {currentBatch.discrepancyItemsCount} exceptions).
                </p>
                <p className="text-slate-500">
                  Respective managers received detailed email alerts with direct links to review and sign off their resources.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block">
                  Next Steps:
                </span>
                
                {onNavigateToManager && (
                  <button
                    onClick={() => {
                      setShowApprovalInitiatedModal(false);
                      const targetManager = currentBatch.items.find(i => i.managerEmail)?.managerEmail || 'sarah.jenkins@abcompany.com';
                      onNavigateToManager(targetManager);
                    }}
                    className="w-full p-3.5 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 rounded-xl text-left flex items-center justify-between text-blue-900 transition-colors group cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-sm text-blue-800 group-hover:text-blue-900">
                        Switch to Manager Review Desk →
                      </div>
                      <div className="text-[11px] text-blue-600 mt-0.5">
                        Act as Resource Manager to sign off lines and resolve discrepancies
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-blue-600 group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                  </button>
                )}

                {onNavigateToNotifications && (
                  <button
                    onClick={() => {
                      setShowApprovalInitiatedModal(false);
                      onNavigateToNotifications();
                    }}
                    className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left flex items-center justify-between text-slate-800 transition-colors group cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-800">
                        Open Email Notification Center
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Inspect the email notifications and approval links sent to managers
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowApprovalInitiatedModal(false)}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs"
              >
                Close & Stay on Vendor Portal
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

