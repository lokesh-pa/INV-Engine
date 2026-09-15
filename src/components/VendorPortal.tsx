import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  Search, 
  SlidersHorizontal, 
  Edit3, 
  Check, 
  CheckCheck, 
  X, 
  ArrowRight, 
  HelpCircle, 
  BellRing, 
  Mail, 
  Printer, 
  TrendingUp, 
  Layers,
  Lock
} from 'lucide-react';
import { 
  InvoiceBatch, 
  InternalTimesheet, 
  Currency, 
  UserProfile, 
  DiscrepancyItem,
  ReminderPayload
} from '../types';
import { parseExcelFile, downloadVendorInvoiceTemplate, downloadComparisonReport } from '../utils/excelHelper';
import { reconcileInvoiceRows, formatCurrency } from '../utils/reconciliationEngine';
import { ACTIVE_PURCHASE_ORDERS } from '../data/mockCentralDb';
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
  onSendReminder?: (payload: ReminderPayload) => void;
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
  onSendReminder,
  onOpenPdfReport
}) => {
  // Vendor Allowed Purchase Orders (Restricted by Vendor Organization)
  const vendorAllowedPOs = useMemo(() => {
    if (currentUser.role === 'vendor' && currentUser.vendorName) {
      const filtered = ACTIVE_PURCHASE_ORDERS.filter(
        po => po.vendorName.toLowerCase().trim() === currentUser.vendorName!.toLowerCase().trim()
      );
      if (filtered.length > 0) return filtered;
    }
    return ACTIVE_PURCHASE_ORDERS;
  }, [currentUser]);

  const [selectedPo, setSelectedPo] = useState<string>(() => {
    if (currentUser.role === 'vendor' && currentUser.vendorName) {
      const match = ACTIVE_PURCHASE_ORDERS.find(
        po => po.vendorName.toLowerCase().trim() === currentUser.vendorName!.toLowerCase().trim()
      );
      if (match) return match.poNumber;
    }
    return 'PO-AB-2026-8941';
  });

  // Keep selectedPo synchronized if currentUser vendor changes
  useEffect(() => {
    if (currentUser.role === 'vendor' && currentUser.vendorName) {
      const match = ACTIVE_PURCHASE_ORDERS.find(
        po => po.vendorName.toLowerCase().trim() === currentUser.vendorName!.toLowerCase().trim()
      );
      if (match && (!selectedPo || !vendorAllowedPOs.some(p => p.poNumber === selectedPo))) {
        setSelectedPo(match.poNumber);
      }
    }
  }, [currentUser, vendorAllowedPOs, selectedPo]);

  const [billingMonth, setBillingMonth] = useState<string>('2026-08');
  const [filterMode, setFilterMode] = useState<'all' | 'mismatch' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showDashboardChart, setShowDashboardChart] = useState<boolean>(false);
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Distinct resource count for KPI display (Point 5)
  const distinctResourceCount = useMemo(() => {
    if (!currentBatch || !currentBatch.items) return 0;
    const emails = new Set(currentBatch.items.map(i => i.resourceEmail?.toLowerCase().trim() || i.resourceName));
    return emails.size || currentBatch.totalLineItems;
  }, [currentBatch]);

  // Approval flow pending action threshold check (Point 3)
  // Print Audit PDF & PICC should only be enabled once all Managers/Delegates or COO take action.
  // If an approval flow is still awaiting response for more than 10% of line-items, it shouldn't be enabled.
  const { pendingActionCount, pendingPercentage, isClearanceLocked } = useMemo(() => {
    if (!currentBatch || !currentBatch.items || currentBatch.items.length === 0) {
      return { pendingActionCount: 0, pendingPercentage: 0, isClearanceLocked: true };
    }
    const pendingItems = currentBatch.items.filter(i => 
      i.status === 'AWAITING_MANAGER_REVIEW' || 
      i.status === 'RESUBMITTED_FOR_REVIEW' || 
      i.status === 'PENDING_ROUTINE_APPROVAL' ||
      (!currentBatch.approvalFlowInitiated && i.status === 'PENDING_CLEARANCE' && i.discrepancyType !== 'NONE')
    );
    const count = pendingItems.length;
    const total = currentBatch.items.length;
    const pct = total > 0 ? (count / total) * 100 : 0;
    return {
      pendingActionCount: count,
      pendingPercentage: pct,
      isClearanceLocked: pct > 10
    };
  }, [currentBatch]);

  // Direct Nudge State & Visual Confirmations
  const [nudgedItemIds, setNudgedItemIds] = useState<Record<string, string>>({});
  const [nudgeBannerMessage, setNudgeBannerMessage] = useState<string | null>(null);

  const handleQuickNudge = (item: DiscrepancyItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentBatch) return;

    if (onSendReminder) {
      onSendReminder({
        targetAudience: 'SPECIFIC_MANAGER',
        recipientEmail: item.managerEmail,
        recipientEmails: [item.managerEmail],
        recipientName: item.managerName,
        recipientNames: [item.managerName],
        subject: `[Action Required] Timesheet Approval Nudge for ${item.resourceName} (${selectedPo} Line ${item.poLineItem})`,
        message: `Dear ${item.managerName},

This is a priority follow-up regarding consultant ${item.resourceName} on Purchase Order ${selectedPo} (Line Item: ${item.poLineItem}).

• Consultant: ${item.resourceName} (${item.admRole || 'Consultant'})
• Claimed Billed Days: ${item.billedDays} days
• Approved Timesheet: ${item.internalApprovedDays} days
• Status: ${item.status === 'REJECTED_BY_MANAGER' ? 'Correction Resubmitted by Vendor' : 'Awaiting Manager Authorization'}

Please review and authorize this record in your Manager Authorization Queue so that our monthly invoice clearance can be finalized without payment delay.

Thank you,
${currentUser.name} (${currentUser.vendorName || 'Apex Accounts Receivable'})`,
        urgency: 'URGENT',
        poNumber: selectedPo,
        batchId: currentBatch.id,
        relatedDiscrepancyId: item.id
      });
    } else if (onOpenSendReminder) {
      onOpenSendReminder({
        poNumber: selectedPo,
        batchId: currentBatch.id,
        recipientEmail: item.managerEmail,
        item
      });
      return;
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setNudgedItemIds(prev => ({ ...prev, [item.id]: timeStr }));
    setNudgeBannerMessage(`Priority nudge dispatched to ${item.managerName} (${item.managerEmail}) for ${item.resourceName}.`);
    setTimeout(() => setNudgeBannerMessage(null), 5000);
  };

  // Modals for Correction and Discrepancy Warning
  const [itemToCorrect, setItemToCorrect] = useState<DiscrepancyItem | null>(null);
  const [revisedDays, setRevisedDays] = useState<number>(0);
  const [revisedRate, setRevisedRate] = useState<number>(0);
  const [revisionNotes, setRevisionNotes] = useState<string>('');
  const [showDiscrepancyWarningModal, setShowDiscrepancyWarningModal] = useState<boolean>(false);
  const [showApprovalInitiatedModal, setShowApprovalInitiatedModal] = useState<boolean>(false);
  const [showHistoricalTrends, setShowHistoricalTrends] = useState<boolean>(false);
  
  
  const [queueMainTab, setQueueMainTab] = useState<'ACTION_REQUIRED' | 'ACTIONED_HISTORY'>('ACTION_REQUIRED');
  const [actionSubFilter, setActionSubFilter] = useState<'all' | 'rejected' | 'overages'>('all');
  const [historySubFilter, setHistorySubFilter] = useState<'all' | 'matched' | 'resolved' | 'resubmitted'>('all');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const poInfo = ACTIVE_PURCHASE_ORDERS.find(po => po.poNumber === selectedPo) || ACTIVE_PURCHASE_ORDERS[0];

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

      // Strict Vendor Data Isolation Enforcement:
      // Each vendor partner can upload invoice data for their own organization only, not for other vendors.
      if (currentUser.role === 'vendor' && currentUser.vendorName) {
        const userVendorNormalized = currentUser.vendorName.toLowerCase().trim();

        // 1. Check if the target PO belongs to a different vendor partner
        const poRecord = ACTIVE_PURCHASE_ORDERS.find(
          p => p.poNumber.toUpperCase() === detectedPo.toUpperCase()
        );
        if (poRecord && poRecord.vendorName.toLowerCase().trim() !== userVendorNormalized) {
          throw new Error(
            `Data Isolation Restriction: You are signed in as "${currentUser.vendorName}". Purchase Order "${detectedPo}" belongs to "${poRecord.vendorName}". You are strictly authorized to upload and reconcile invoice data for "${currentUser.vendorName}" only.`
          );
        }

        // 2. Check if any individual line item targets a different vendor
        const crossVendorRow = parsedRows.find(row => {
          const rowVendor = (row as any).vendorName;
          return rowVendor && rowVendor.toLowerCase().trim() !== userVendorNormalized;
        });

        if (crossVendorRow) {
          throw new Error(
            `Data Isolation Restriction: Upload rejected. Row for "${crossVendorRow.resourceName}" specifies vendor "${(crossVendorRow as any).vendorName}". As an authorized partner of "${currentUser.vendorName}", you can only upload invoice records for your own organization.`
          );
        }
      }

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

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const openCorrectionModal = (item: DiscrepancyItem) => {
    setItemToCorrect(item);
    setRevisedDays(item.internalApprovedDays > 0 ? item.internalApprovedDays : item.billedDays);
    setRevisedRate(item.claimedDailyRate);
    setRevisionNotes(item.managerDecision?.justificationNotes ? `Addressing manager note: ${item.managerDecision.justificationNotes}` : '');
  };

  const submitLineCorrection = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!itemToCorrect || !currentBatch) return;

    const isResubmission = itemToCorrect.status === 'REJECTED_BY_MANAGER';

    if (onCorrectLineItem) {
      onCorrectLineItem(
        currentBatch.id,
        itemToCorrect.id,
        revisedDays,
        revisedRate,
        revisionNotes,
        isResubmission
      );
    } else {
      const updatedItems = currentBatch.items.map(it => {
        if (it.id === itemToCorrect.id) {
          const daysVar = +(revisedDays - it.internalApprovedDays).toFixed(1);
          const amtVar = +((revisedDays * revisedRate) - (it.internalApprovedDays * it.claimedDailyRate)).toFixed(2);
          return {
            ...it,
            billedDays: revisedDays,
            claimedDailyRate: revisedRate,
            claimedAmount: +(revisedDays * revisedRate).toFixed(2),
            daysVariance: daysVar,
            amountVariance: amtVar,
            status: isResubmission ? ('RESUBMITTED_FOR_REVIEW' as const) : daysVar === 0 ? ('MATCHED' as const) : ('MISMATCH_DAYS' as const),
            vendorNotes: revisionNotes
          };
        }
        return it;
      });

      const matchedCount = updatedItems.filter(i => i.status === 'MATCHED').length;
      const discrepancyCount = updatedItems.length - matchedCount;

      onBatchUpdated({
        ...currentBatch,
        items: updatedItems,
        matchedItemsCount: matchedCount,
        discrepancyItemsCount: discrepancyCount,
        status: discrepancyCount === 0 ? 'CLEARED_FOR_ARIBA' : currentBatch.status
      });
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

  // Quick Align single item to approved timesheet hours
  const handleQuickAlign = (item: DiscrepancyItem) => {
    if (!currentBatch || item.internalApprovedDays <= 0) return;
    if (onCorrectLineItem) {
      onCorrectLineItem(
        currentBatch.id,
        item.id,
        item.internalApprovedDays,
        item.contractDailyRate,
        'Aligned to internal approved timesheet days',
        item.status === 'REJECTED_BY_MANAGER'
      );
    }
  };

  // Bulk Align selected items to DB timesheets
  const handleBulkAlignToTimesheet = () => {
    if (!currentBatch || selectedItemIds.size === 0) return;
    selectedItemIds.forEach(id => {
      const it = currentBatch.items.find(i => i.id === id);
      if (it && it.internalApprovedDays > 0) {
        if (onCorrectLineItem) {
          onCorrectLineItem(
            currentBatch.id,
            it.id,
            it.internalApprovedDays,
            it.contractDailyRate,
            'Bulk aligned to internal approved timesheet days',
            it.status === 'REJECTED_BY_MANAGER'
          );
        }
      }
    });
    setSelectedItemIds(new Set());
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Queue separation logic
  const isItemActionRequired = (item: DiscrepancyItem) => {
    const isRejected = item.status === 'REJECTED_BY_MANAGER';
    const isUnresolvedMismatch = item.discrepancyType !== 'PERFECT_MATCH' && !item.managerDecision && item.status !== 'RESUBMITTED_FOR_REVIEW';
    return isRejected || isUnresolvedMismatch;
  };

  const actionRequiredItems = currentBatch?.items.filter(isItemActionRequired) || [];
  const actionedHistoryItems = currentBatch?.items.filter(it => !isItemActionRequired(it)) || [];

  const rejectedCount = currentBatch?.items.filter(i => i.status === 'REJECTED_BY_MANAGER').length || 0;
  const overagesCount = currentBatch?.items.filter(i => i.daysVariance > 0 && !i.managerDecision && i.status !== 'REJECTED_BY_MANAGER' && i.status !== 'RESUBMITTED_FOR_REVIEW').length || 0;
  const matchedCount = currentBatch?.items.filter(i => (i.discrepancyType === 'PERFECT_MATCH' || i.status === 'AUTO_MATCHED') && !i.managerDecision && i.status !== 'RESUBMITTED_FOR_REVIEW').length || 0;
  const resolvedByManagerCount = currentBatch?.items.filter(i => i.managerDecision != null).length || 0;
  const resubmittedCount = currentBatch?.items.filter(i => i.status === 'RESUBMITTED_FOR_REVIEW').length || 0;

  const displayedItems = (queueMainTab === 'ACTION_REQUIRED' ? actionRequiredItems : actionedHistoryItems).filter(item => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        item.resourceEmail.toLowerCase().includes(q) ||
        item.resourceName.toLowerCase().includes(q) ||
        item.managerName.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    if (queueMainTab === 'ACTION_REQUIRED') {
      if (actionSubFilter === 'rejected') return item.status === 'REJECTED_BY_MANAGER';
      if (actionSubFilter === 'overages') return item.daysVariance > 0 && item.status !== 'REJECTED_BY_MANAGER';
      return true;
    } else {
      if (historySubFilter === 'matched') return (item.discrepancyType === 'PERFECT_MATCH' || item.status === 'AUTO_MATCHED') && !item.managerDecision && item.status !== 'RESUBMITTED_FOR_REVIEW';
      if (historySubFilter === 'resolved') return item.managerDecision != null;
      if (historySubFilter === 'resubmitted') return item.status === 'RESUBMITTED_FOR_REVIEW';
      return true;
    }
  });

  const handleSelectAllActionRequired = () => {
    if (selectedItemIds.size === displayedItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(displayedItems.map(i => i.id)));
    }
  };

  const filteredItems = displayedItems;
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
                Resource Manager Rejected Line Data — Revision Required for Pre-Invoice Clearance
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                One or more invoice lines were rejected during review. Pre-Invoice Clearance is strictly held until you correct the billed days/rates and resubmit for manager authorization.
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
                Vendor Invoicing Desk (RBAC: Vendor Access)
              </span>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded-full font-bold border border-emerald-100 uppercase">
                Invoice Submissions Active
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

            {/* Primary Action: Upload Vendor Invoice Data (Always visible) */}
            <button
              id="upload-vendor-invoice-data-top-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="text-xs px-4 py-2 bg-blue-600 border border-blue-600 rounded-lg font-bold text-white hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Load / Upload supplier invoice data spreadsheet to reconcile against AB company internal timesheet records"
            >
              <UploadCloud className="w-3.5 h-3.5 text-white" />
              <span>{isProcessing ? 'Processing File...' : 'Upload Vendor Invoice Data'}</span>
            </button>

            {/* When batch is open: Quick Action to Open Invoice Data */}
            {currentBatch && (
              <button
                id="open-invoice-data-top-btn"
                onClick={() => {
                  const el = document.getElementById('invoice-lines-table-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-xs px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg font-medium text-slate-800 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Open and navigate directly to invoice reconciliation lines"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Open Invoice Data ({currentBatch.totalLineItems} Lines)</span>
              </button>
            )}

            {/* When batch is open: Download Comparison Button */}
            {currentBatch && (
              <button
                id="download-comparison-top-btn"
                onClick={() => downloadComparisonReport(currentBatch, currentCurrency)}
                className="text-xs px-3.5 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg font-bold transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Download complete status & variance comparison between your submission and AB Company internal timesheet records"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Download Comparison</span>
              </button>
            )}

            <button
              id="vendor-toggle-analytics-btn"
              onClick={() => setShowDashboardChart(!showDashboardChart)}
              className={`text-xs px-3.5 py-2 rounded-lg font-medium transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                showDashboardChart
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Toggle analytics and status charts view"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{showDashboardChart ? 'Hide Analytics' : 'Show Analytics'}</span>
            </button>

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
          </div>
        </div>

        {/* Single PO Submission Guideline Callout */}
        <div className="mt-3.5 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5 shadow-2xs">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <span className="font-bold text-blue-950">PO Submission Guideline:</span> We expect vendors to submit invoices for <strong>one PO per submission</strong>, which can include hundreds of consultant resource lines mapped to that PO. Smaller POs can also be clubbed together in one submission.
          </div>
        </div>

        {/* Nudge Confirmation Toast Banner */}
        {nudgeBannerMessage && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium flex items-center justify-between gap-3 animate-in fade-in duration-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{nudgeBannerMessage}</span>
            </div>
            <button 
              onClick={() => setNudgeBannerMessage(null)}
              className="text-amber-600 hover:text-amber-800 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Target Purchase Order (PO)
              </label>
              {currentUser.role === 'vendor' && (
                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-slate-400" />
                  <span>{currentUser.vendorName}</span>
                </span>
              )}
            </div>
            <select
              id="vendor-po-select"
              value={selectedPo}
              onChange={(e) => setSelectedPo(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
            >
              {vendorAllowedPOs.map(po => (
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

      {/* Dashboard Summary Chart (Recharts) - Expandable / Clean default */}
      {showDashboardChart && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Invoice Reconciliation Analytics</span>
            </h3>
            <button
              onClick={() => setShowDashboardChart(false)}
              className="text-xs text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
        </div>
      )}

      {/* Upload Zone (If no batch loaded) */}
      {!currentBatch && (
        <div
          id="vendor-upload-first-screen-zone"
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
          <h3 className="text-base font-bold text-slate-800 tracking-tight">
            Reconcile Supplier Invoice with AB Company Internal Timesheets
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
            Input columns recognized: <span className="font-mono text-slate-700 font-semibold">Purchase Order Number, PO Line Item, Resource Email ID, ADM Seniority, ADM Role, Resource Location (City), Billed Days, Daily Rate</span>
          </p>

          {/* Primary CTA: Load Supplier Invoice Data */}
          <div className="mt-4 flex justify-center">
            <button
              id="load-supplier-invoice-data-card-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{isProcessing ? 'Reconciling Data...' : 'Load Supplier Invoice Data'}</span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-[11px] font-medium border border-blue-100">
              <FileSpreadsheet className="w-3 h-3 text-blue-600" />
              <span>Automated PO Verification</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[11px] font-medium border border-emerald-100">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>PO Line Item Level Matching</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-md text-[11px] text-slate-700 font-medium">
              <Lock className="w-3 h-3 text-slate-500" />
              <span>Authorized Vendor: {currentUser.vendorName || 'Apex Global Solutions'}</span>
            </span>
          </div>
        </div>
      )}

      {/* Sleek 4-Column KPI Grid */}
      {currentBatch && (
        <div className="space-y-6" id="invoice-lines-table-section">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Card 1: Resource Count (Renamed from Submitted Invoices) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Resource Count
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {distinctResourceCount} <span className="text-sm font-semibold text-slate-500">Resources</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-2">
                {currentBatch.totalLineItems} Total Billing Line Items ({currentBatch.billingMonth})
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

            {/* Card 4: Clearance Sign-Off with Threshold Status */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Clearance Sign-Off
              </p>
              <p className={`text-xl font-bold ${
                isClearanceLocked 
                  ? 'text-amber-600' 
                  : currentBatch.status === 'CLEARED_FOR_ARIBA' || currentBatch.status === 'CLEARANCE_CERTIFICATE_ISSUED'
                  ? 'text-emerald-600' 
                  : 'text-blue-600'
              }`}>
                {isClearanceLocked
                  ? `Locked (${pendingPercentage.toFixed(0)}% Pending)`
                  : currentBatch.status === 'CLEARED_FOR_ARIBA' || currentBatch.status === 'CLEARANCE_CERTIFICATE_ISSUED'
                  ? 'PICC Issued (100% Cleared)'
                  : 'Sign-Off Ready'}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">
                {isClearanceLocked
                  ? `${pendingActionCount} lines awaiting response (≤10% needed for PICC)`
                  : '≤10% pending threshold met; Audit PDF & PICC active'}
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
                  : 'All consultant days and rates match internal timesheets. Generate your official Pre-Invoice Clearance Certificate (PICC) below.'}
              </p>
              {currentBatch.approvalFlowInitiated && (
                <div className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Approval workflow active for all resources. Alert notifications sent to respective AB Company resource managers.</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              

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
                  onClick={() => {
                    const pendingItem = currentBatch.items.find(i => 
                      i.status === 'AWAITING_MANAGER_REVIEW' || 
                      i.status === 'RESUBMITTED_FOR_REVIEW' || 
                      i.status === 'PENDING_ROUTINE_APPROVAL' ||
                      i.status === 'REJECTED_BY_MANAGER'
                    );
                    onOpenSendReminder({ 
                      poNumber: currentBatch.poNumber, 
                      batchId: currentBatch.id,
                      recipientEmail: pendingItem?.managerEmail,
                      item: pendingItem
                    });
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Send a prioritized reminder to resource managers to review pending timesheets"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Nudge Managers</span>
                </button>
              )}

              {/* Printable Audit PDF (Enabled only when pending approval items <= 10%) */}
              {onOpenPdfReport && (
                <button
                  id="vendor-export-pdf-report-btn"
                  onClick={() => !isClearanceLocked && onOpenPdfReport(currentBatch)}
                  disabled={isClearanceLocked}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                    isClearanceLocked
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
                  }`}
                  title={
                    isClearanceLocked
                      ? `Clearance locked: ${pendingActionCount} of ${currentBatch.totalLineItems} lines (${pendingPercentage.toFixed(0)}%) awaiting manager/delegate/COO review. Must have ≤10% pending to generate Printable Audit PDF.`
                      : 'Export Current Invoice Batch Summary and Pre-Invoice Clearance Certificate as a Printable PDF Report'
                  }
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Printable Audit PDF</span>
                </button>
              )}

              {/* Pre-Invoice Clearance Certificate (PICC) (Enabled only when pending approval items <= 10%) */}
              <button
                id="view-clearance-certificate-btn"
                onClick={() => !isClearanceLocked && onOpenAribaCertificate(currentBatch)}
                disabled={isClearanceLocked}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                  isClearanceLocked
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs cursor-pointer'
                }`}
                title={
                  isClearanceLocked
                    ? `PICC locked: ${pendingActionCount} of ${currentBatch.totalLineItems} lines (${pendingPercentage.toFixed(0)}%) awaiting manager approval. Must have ≤10% pending to generate PICC.`
                    : 'View and generate Pre-Invoice Clearance Certificate (PICC) for SAP Ariba Submission'
                }
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Pre-Invoice Clearance Certificate (PICC)</span>
              </button>

              {isClearanceLocked && (
                <span 
                  className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
                  title="Approval threshold requirement"
                >
                  <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>PICC Locked ({pendingPercentage.toFixed(0)}% lines awaiting action &gt; 10% threshold)</span>
                </span>
              )}
            </div>
          </div>

          {/* Sleek Reconciliations & Ariba GR Table Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            
            {/* Table Header */}
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Invoice Lines & Reconciliation
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono font-bold">
                  {currentBatch.totalLineItems} Lines
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs flex-wrap">
                {/* Download Comparison Button directly in Table Header */}
                <button
                  id="table-download-comparison-btn"
                  onClick={() => downloadComparisonReport(currentBatch, currentCurrency)}
                  className="px-2.5 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-md font-bold transition-colors inline-flex items-center gap-1 text-[11px] shadow-2xs cursor-pointer"
                  title="Download comparison and variance analysis report in Excel format"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-700" />
                  <span>Download Comparison</span>
                </button>

                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{currentBatch.matchedItemsCount} Auto-Matched</span>
                </span>
                {currentBatch.discrepancyItemsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-700 font-medium bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span>{currentBatch.discrepancyItemsCount} Variance Lines</span>
                  </span>
                )}
              </div>
            </div>

            {/* Reconciliation Lines View */}
            <>
                {/* Two Primary Queue Tabs: Action Required vs Actioned History */}
                <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1.5 border border-slate-200/80 m-4 mb-2">
                  <button
                    id="vendor-tab-action-required"
                    onClick={() => {
                      setQueueMainTab('ACTION_REQUIRED');
                      setSelectedItemIds(new Set());
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      queueMainTab === 'ACTION_REQUIRED'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <Clock className={`w-4 h-4 ${queueMainTab === 'ACTION_REQUIRED' ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span>Action Required (Corrections & Overages)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      queueMainTab === 'ACTION_REQUIRED'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {actionRequiredItems.length}
                    </span>
                  </button>

                  <button
                    id="vendor-tab-actioned-history"
                    onClick={() => {
                      setQueueMainTab('ACTIONED_HISTORY');
                      setSelectedItemIds(new Set());
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      queueMainTab === 'ACTIONED_HISTORY'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <CheckCircle2 className={`w-4 h-4 ${queueMainTab === 'ACTIONED_HISTORY' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>Cleared & In Progress (Resolved)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      queueMainTab === 'ACTIONED_HISTORY'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {actionedHistoryItems.length}
                    </span>
                  </button>
                </div>

                {/* Sub-Filters and Toolbar */}
                <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {queueMainTab === 'ACTION_REQUIRED' ? (
                      <>
                        <button
                          onClick={() => setActionSubFilter('all')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                            actionSubFilter === 'all'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          All Action Items ({actionRequiredItems.length})
                        </button>
                        <button
                          onClick={() => setActionSubFilter('rejected')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                            actionSubFilter === 'rejected'
                              ? 'bg-red-600 text-white shadow-2xs'
                              : rejectedCount > 0
                              ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Manager Rejections ({rejectedCount})</span>
                        </button>
                        <button
                          onClick={() => setActionSubFilter('overages')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                            actionSubFilter === 'overages'
                              ? 'bg-amber-600 text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>Days Overbilled ({overagesCount})</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setHistorySubFilter('all')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                            historySubFilter === 'all'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          All Cleared ({actionedHistoryItems.length})
                        </button>
                        <button
                          onClick={() => setHistorySubFilter('matched')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                            historySubFilter === 'matched'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Routine Matches ({matchedCount})</span>
                        </button>
                        <button
                          onClick={() => setHistorySubFilter('resolved')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                            historySubFilter === 'resolved'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>Manager Exceptions & Caps ({resolvedByManagerCount})</span>
                        </button>
                        <button
                          onClick={() => setHistorySubFilter('resubmitted')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                            historySubFilter === 'resubmitted'
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <RotateCcw className="w-3 h-3 text-purple-600" />
                          <span>In Review / Resubmitted ({resubmittedCount})</span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search resource name, email..."
                        className="text-xs px-3 py-1.5 pl-8 border border-slate-200 rounded-lg w-full bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    </div>

                    {queueMainTab === 'ACTION_REQUIRED' && displayedItems.length > 0 && (
                      <button
                        onClick={handleSelectAllActionRequired}
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg shadow-2xs shrink-0 cursor-pointer"
                      >
                        {selectedItemIds.size === displayedItems.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Table Content */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        {queueMainTab === 'ACTION_REQUIRED' && (
                          <th className="px-4 py-4 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={displayedItems.length > 0 && selectedItemIds.size === displayedItems.length}
                              onChange={handleSelectAllActionRequired}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </th>
                        )}
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
                      {displayedItems.length === 0 ? (
                        <tr>
                          <td colSpan={queueMainTab === 'ACTION_REQUIRED' ? 8 : 7} className="px-6 py-12 text-center">
                            <div className="max-w-md mx-auto space-y-2">
                              {queueMainTab === 'ACTION_REQUIRED' ? (
                                <>
                                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                                  <h3 className="text-sm font-bold text-slate-800">Zero Pending Action Items</h3>
                                  <p className="text-xs text-slate-500">
                                    All invoice consultant lines currently match central approved timesheets or have been signed off by resource managers.
                                  </p>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                                  <h3 className="text-sm font-bold text-slate-800">No Actioned Items Found</h3>
                                  <p className="text-xs text-slate-500">
                                    Items that achieve exact match or receive manager approval/adjustments will be documented here.
                                  </p>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        displayedItems.map((item, idx) => {
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
                              {/* Selection Checkbox for Action Required */}
                              {queueMainTab === 'ACTION_REQUIRED' && (
                                <td className="px-4 py-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedItemIds.has(item.id)}
                                    onChange={() => toggleSelectItem(item.id)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </td>
                              )}

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
                                  <div className="mt-1.5 text-[11px] text-red-800 bg-red-100/90 p-2 rounded-lg border border-red-300 shadow-2xs">
                                    <div className="flex items-center gap-1 font-bold text-red-900">
                                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                                      <span>Manager Rejection Rationale ({item.managerDecision.decidedByName}):</span>
                                    </div>
                                    <p className="mt-0.5 italic text-red-700">"{item.managerDecision.justificationNotes}"</p>
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
                                    <span className="font-bold text-slate-800">{item.internalApprovedDays.toFixed(1)} Days</span>
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
                                  <span className="text-emerald-600 font-semibold text-xs inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    <span>0.0 (Perfect Match)</span>
                                  </span>
                                )}
                                {item.daysVariance > 0 && (
                                  <div className="space-y-0.5">
                                    <span className="text-red-600 font-semibold text-xs block">
                                      +{item.daysVariance.toFixed(1)} Days ({formatCurrency(item.financialVarianceAmount, currentCurrency)})
                                    </span>
                                    <span className="text-[10px] text-red-500 block font-medium">Exceeds timesheet</span>
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
                                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-[10px] rounded-full font-bold border border-purple-200 uppercase inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-purple-600" />
                                    <span>Resubmitted for Review</span>
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
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
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
                                      {item.internalApprovedDays > 0 && item.daysVariance > 0 && (
                                        <button
                                          onClick={() => handleQuickAlign(item)}
                                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                                          title={`Auto-align billed days directly to internal approved timesheet (${item.internalApprovedDays.toFixed(1)} days)`}
                                        >
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span>Align to Timesheet ({item.internalApprovedDays.toFixed(1)}d)</span>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => openCorrectionModal(item)}
                                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-blue-600 text-xs font-semibold rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Edit3 className="w-3 h-3 text-blue-500" />
                                        <span>Correct Line</span>
                                      </button>

                                      {/* Enhanced Contextual Nudge Manager Action */}
                                      {nudgedItemIds[item.id] ? (
                                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg shadow-2xs inline-flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                          <span>Nudged ({nudgedItemIds[item.id]})</span>
                                        </span>
                                      ) : (
                                        <div className="inline-flex items-center rounded-lg border border-amber-300 shadow-2xs overflow-hidden">
                                          <button
                                            onClick={(e) => handleQuickNudge(item, e)}
                                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                            title={`Directly nudge manager ${item.managerName} (${item.managerEmail}) to authorize line`}
                                          >
                                            <BellRing className="w-3 h-3" />
                                            <span>Nudge Manager</span>
                                          </button>
                                          {onOpenSendReminder && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenSendReminder({
                                                  poNumber: currentBatch.poNumber,
                                                  batchId: currentBatch.id,
                                                  recipientEmail: item.managerEmail,
                                                  item
                                                });
                                              }}
                                              className="px-1.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs transition-colors border-l border-amber-400 cursor-pointer"
                                              title="Open modal to customize nudge note"
                                            >
                                              <Mail className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {item.status === 'RESUBMITTED_FOR_REVIEW' ? (
                                        <>
                                          <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs font-medium">
                                            In Review
                                          </span>
                                          {nudgedItemIds[item.id] ? (
                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-semibold inline-flex items-center gap-1">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                              <span>Nudged</span>
                                            </span>
                                          ) : (
                                            <button
                                              onClick={(e) => handleQuickNudge(item, e)}
                                              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                              title={`Nudge ${item.managerName} to approve resubmitted line`}
                                            >
                                              <BellRing className="w-3 h-3" />
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
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Floating Bulk Action Toolbar for Vendor in Action Required */}
                {selectedItemIds.size > 0 && queueMainTab === 'ACTION_REQUIRED' && (
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <span className="text-xs font-bold text-slate-200">
                      {selectedItemIds.size} lines selected
                    </span>
                    <button
                      onClick={handleBulkAlignToTimesheet}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                      title="Auto-align all selected lines to approved timesheet hours"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Bulk Align to DB Timesheets</span>
                    </button>
                    {onOpenSendReminder && (
                      <button
                        onClick={() => {
                          const firstSelected = currentBatch.items.find(i => selectedItemIds.has(i.id));
                          onOpenSendReminder({
                            poNumber: currentBatch.poNumber,
                            batchId: currentBatch.id,
                            recipientEmail: firstSelected?.managerEmail,
                            item: firstSelected
                          });
                        }}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                        title="Nudge managers for selected lines"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Bulk Nudge Managers</span>
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedItemIds(new Set())}
                      className="px-2.5 py-1 text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Bottom Table Summary */}
                <div className="p-3.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
                  <span>Financial Variance Exposure: <strong className="text-slate-800">{formatCurrency(currentBatch.netVarianceAmount, currentCurrency)}</strong></span>
                  <span className="font-mono">AB Company Invoicing Engine • Pre-Invoice Clearance</span>
                </div>
              </>

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

