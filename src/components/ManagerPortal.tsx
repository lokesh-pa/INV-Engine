import React, { useState } from 'react';
import { 
  UserCheck, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ShieldAlert, 
  FileCheck2,
  Calendar,
  Clock,
  Sparkles,
  RotateCcw,
  CheckCheck,
  Send,
  ArrowRight,
  Info,
  CheckSquare,
  Square,
  Download,
  ShieldCheck,
  UserPlus,
  Layers,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  BellRing,
  RefreshCw
} from 'lucide-react';
import { 
  InvoiceBatch, 
  DiscrepancyItem, 
  UserProfile, 
  Currency,
  ApprovalDelegation,
  BulkApprovalAction,
  AuditLogEntry
} from '../types';
import { formatCurrency } from '../utils/reconciliationEngine';
import { SAMPLE_USERS, getDomainCooForManager, getSkipLevelManagerForManager } from '../data/mockCentralDb';
import { evaluateItemEscalation, buildEscalationNotification } from '../utils/escalationHelper';
import { hasPermission } from '../utils/rbac';
import { DelegationModal } from './DelegationModal';
import { BulkApprovalModal } from './BulkApprovalModal';
import { ExportModal } from './ExportModal';
import { InvoiceStatusChart } from './InvoiceStatusChart';

interface ManagerPortalProps {
  currentUser: UserProfile;
  currentCurrency: Currency;
  batches: InvoiceBatch[];
  onResolveDiscrepancy: (
    batchId: string,
    itemId: string,
    action: 'APPROVE_VARIANCE' | 'ADJUST_TO_INTERNAL' | 'REJECT_BILLING' | 'APPROVE_ROUTINE',
    justification: string,
    adjustedDays?: number
  ) => void;
  onSelectManager: (user: UserProfile) => void;
  onApproveMatchedLines?: (batchId: string, itemIds: string[]) => void;
  delegations?: ApprovalDelegation[];
  onSaveDelegation?: (delegation: ApprovalDelegation) => void;
  onRevokeDelegation?: (delegationId: string) => void;
  onBulkResolve?: (
    itemIds: string[],
    action: BulkApprovalAction,
    justification: string
  ) => void;
  auditLogs?: AuditLogEntry[];
  onOpenSendReminder?: (options?: { poNumber?: string; batchId?: string; recipientEmail?: string; item?: DiscrepancyItem }) => void;
  onResyncWithTimesheets?: (batchId?: string) => void;
  onOpenPdfReport?: (batch: InvoiceBatch) => void;
  onSendNotification?: (notification: any) => void;
}

export const ManagerPortal: React.FC<ManagerPortalProps> = ({
  currentUser,
  currentCurrency,
  batches,
  onResolveDiscrepancy,
  onSelectManager,
  onApproveMatchedLines,
  delegations = [],
  onSaveDelegation,
  onRevokeDelegation,
  onBulkResolve,
  auditLogs = [],
  onOpenSendReminder,
  onResyncWithTimesheets,
  onOpenPdfReport,
  onSendNotification
}) => {
  const [selectedItemForReview, setSelectedItemForReview] = useState<{
    batch: InvoiceBatch;
    item: DiscrepancyItem;
  } | null>(null);

  const [justificationNotes, setJustificationNotes] = useState<string>('');
  const [reviewAction, setReviewAction] = useState<'APPROVE_VARIANCE' | 'ADJUST_TO_INTERNAL' | 'REJECT_BILLING'>('APPROVE_VARIANCE');
  const [showAllManagersToggle, setShowAllManagersToggle] = useState<boolean>(false);
  const [activeQueueTab, setActiveQueueTab] = useState<'discrepancies' | 'matches' | 'resubmissions'>('discrepancies');
  const [showDistributionChart, setShowDistributionChart] = useState<boolean>(true);
  const [modalValidationMsg, setModalValidationMsg] = useState<string>('');

  // Smooth scroll helpers so managers can never get stuck
  const scrollToApprovalQueue = () => {
    const el = document.getElementById('manager-action-queue');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToTop = () => {
    const mainViewport = document.getElementById('main-scrollable-viewport') || window;
    mainViewport.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const QUICK_JUSTIFICATION_TEMPLATES = {
    APPROVE_VARIANCE: [
      'Approved critical Q3 sprint deliverable overtime.',
      'Emergency platform migration support verified and cleared.',
      'Scope extension authorized under Statement of Work addendum.'
    ],
    ADJUST_TO_INTERNAL: [
      'Capped strictly to AB Company internal approved timesheet hours.',
      'Unauthorized contractor overtime adjusted to project baseline.',
      'Hours outside core project scope adjusted to internal approved days.'
    ],
    REJECT_BILLING: [
      'Claimed days exceed project baseline without lead engineer sign-off.',
      'Contractor logged hours on unapproved dates; revision required.',
      'Rate claimed does not match master services schedule.'
    ]
  };

  // Bulk Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkModalAction, setBulkModalAction] = useState<BulkApprovalAction>('APPROVE_VARIANCE');

  // Modal State
  const [showDelegationModal, setShowDelegationModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [delegationScopeFilter, setDelegationScopeFilter] = useState<'ALL' | 'MY_RESOURCES' | 'DELEGATED_ONLY'>('ALL');

  // SLA Aging & Escalation Simulation State
  const [simulatedAgingDays, setSimulatedAgingDays] = useState<number>(0);
  const [escalationNoticeSentToast, setEscalationNoticeSentToast] = useState<string | null>(null);

  // Delegations evaluation
  const activeOutgoingDelegation = delegations.find(
    d => d.delegatorEmail.toLowerCase() === currentUser.email.toLowerCase() && d.active
  );
  
  const activeIncomingDelegations = delegations.filter(
    d => d.delegateeEmail.toLowerCase() === currentUser.email.toLowerCase() && d.active
  );

  const delegatedManagerEmails = activeIncomingDelegations.map(d => d.delegatorEmail.toLowerCase());

  // Collect all items across batches
  const allItems: { batch: InvoiceBatch; item: DiscrepancyItem }[] = [];
  batches.forEach(batch => {
    batch.items.forEach(item => {
      allItems.push({ batch, item });
    });
  });

  // Filter for this manager or delegated authority (including Domain COO)
  const managerItems = allItems.filter(({ item }) => {
    if (showAllManagersToggle) return true;

    // Check if Domain COO has executive delegated oversight
    if (currentUser.role === 'domain_coo') {
      const cooMapping = getDomainCooForManager(item.managerEmail, item.department);
      const isUnderDomain = cooMapping.cooEmail.toLowerCase() === currentUser.email.toLowerCase() || currentUser.email === 'marcus.sterling@abcompany.com';
      if (delegationScopeFilter === 'MY_RESOURCES') {
        return isUnderDomain;
      }
      return true; // Domain COO can oversee domain or all
    }

    const isDirectManager = item.managerEmail.toLowerCase() === currentUser.email.toLowerCase();
    const isDelegatedManager = delegatedManagerEmails.includes(item.managerEmail.toLowerCase());

    if (delegationScopeFilter === 'MY_RESOURCES') {
      return isDirectManager;
    } else if (delegationScopeFilter === 'DELEGATED_ONLY') {
      return isDelegatedManager;
    }

    return isDirectManager || isDelegatedManager;
  });

  // Discrepancy items (both pending, rejected, resubmitted, and resolved)
  const managerDiscrepancies = managerItems.filter(({ item }) => item.discrepancyType !== 'PERFECT_MATCH');
  
  // Resubmitted items (corrected by vendor after rejection)
  const managerResubmissions = managerItems.filter(({ item }) => item.status === 'RESUBMITTED_FOR_REVIEW');

  // Routine matched items
  const managerMatches = managerItems.filter(({ item }) => item.discrepancyType === 'PERFECT_MATCH');

  const pendingDiscrepanciesCount = managerDiscrepancies.filter(
    ({ item }) => !item.managerDecision && item.status !== 'REJECTED_BY_MANAGER'
  ).length;

  const rejectedCount = managerDiscrepancies.filter(
    ({ item }) => item.status === 'REJECTED_BY_MANAGER'
  ).length;

  const resubmissionsCount = managerResubmissions.length;
  
  const pendingMatchesCount = managerMatches.filter(
    ({ item }) => item.status === 'PENDING_ROUTINE_APPROVAL' || (!item.managerDecision && item.status !== 'APPROVED_ROUTINE')
  ).length;

  const totalExposure = managerDiscrepancies
    .filter(({ item }) => !item.managerDecision)
    .reduce((sum, { item }) => sum + Math.max(0, item.financialVarianceAmount), 0);

  const canApprove = hasPermission(currentUser.role, 'APPROVE_DISCREPANCIES');

  // Items visible in current queue tab
  const currentTabItems: DiscrepancyItem[] = 
    activeQueueTab === 'discrepancies' 
      ? managerDiscrepancies.map(x => x.item)
      : activeQueueTab === 'resubmissions'
      ? managerResubmissions.map(x => x.item)
      : managerMatches.map(x => x.item);

  const isAllCurrentSelected = 
    currentTabItems.length > 0 && currentTabItems.every(i => selectedItemIds.has(i.id));

  const toggleSelectAll = () => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (isAllCurrentSelected) {
        currentTabItems.forEach(i => next.delete(i.id));
      } else {
        currentTabItems.forEach(i => next.add(i.id));
      }
      return next;
    });
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

  // Extract selected items list
  const selectedItemsList = allItems
    .map(x => x.item)
    .filter(item => selectedItemIds.has(item.id));

  const handleOpenBulkModal = (action: BulkApprovalAction) => {
    setBulkModalAction(action);
    setShowBulkModal(true);
  };

  const handleConfirmBulkApproval = (
    itemIds: string[], 
    action: BulkApprovalAction, 
    justification: string
  ) => {
    if (onBulkResolve) {
      onBulkResolve(itemIds, action, justification);
    } else {
      // Fallback per item
      itemIds.forEach(id => {
        const found = allItems.find(x => x.item.id === id);
        if (found) {
          onResolveDiscrepancy(
            found.batch.id,
            found.item.id,
            action === 'APPROVE_VARIANCE' ? 'APPROVE_VARIANCE' : action === 'ADJUST_TO_INTERNAL' ? 'ADJUST_TO_INTERNAL' : 'APPROVE_ROUTINE',
            justification
          );
        }
      });
    }
    clearSelection();
  };

  const handleOpenReviewModal = (batch: InvoiceBatch, item: DiscrepancyItem) => {
    setSelectedItemForReview({ batch, item });
    setModalValidationMsg('');
    if (item.status === 'RESUBMITTED_FOR_REVIEW' && item.vendorCorrection) {
      setJustificationNotes(`Approved revised billing of ${item.billedDays} days based on vendor correction notes: "${item.vendorCorrection.notes}".`);
      setReviewAction('APPROVE_VARIANCE');
    } else if (item.discrepancyType === 'DAYS_OVERBILLED') {
      setJustificationNotes(`Authorized sprint deliverable overtime (${item.daysVariance} extra days) for production release milestone.`);
      setReviewAction('APPROVE_VARIANCE');
    } else if (item.discrepancyType === 'RATE_MISMATCH') {
      setJustificationNotes('Reviewed rate variance against approved SOW rate card amendment.');
      setReviewAction('APPROVE_VARIANCE');
    } else {
      setJustificationNotes('Timesheet verified and authorized.');
      setReviewAction('APPROVE_VARIANCE');
    }
  };

  const handleSubmitReview = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedItemForReview) return;

    if (!justificationNotes.trim()) {
      setModalValidationMsg('Please select or provide a business justification note for the SAP audit log.');
      return;
    }

    onResolveDiscrepancy(
      selectedItemForReview.batch.id,
      selectedItemForReview.item.id,
      reviewAction,
      justificationNotes.trim()
    );

    setSelectedItemForReview(null);
    setJustificationNotes('');
    setModalValidationMsg('');
  };

  const handleSignOffAllRoutineMatches = () => {
    if (!onApproveMatchedLines) {
      managerMatches.forEach(({ batch, item }) => {
        if (item.status !== 'APPROVED_ROUTINE') {
          onResolveDiscrepancy(
            batch.id,
            item.id,
            'APPROVE_ROUTINE',
            '1-Click Routine Internal Timesheet Sign-off by Manager'
          );
        }
      });
      return;
    }

    const batchGroup: { [batchId: string]: string[] } = {};
    managerMatches.forEach(({ batch, item }) => {
      if (item.status !== 'APPROVED_ROUTINE') {
        if (!batchGroup[batch.id]) batchGroup[batch.id] = [];
        batchGroup[batch.id].push(item.id);
      }
    });

    Object.entries(batchGroup).forEach(([batchId, itemIds]) => {
      onApproveMatchedLines(batchId, itemIds);
    });
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full font-bold border border-blue-100 uppercase">
                Manager Review Desk
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {currentUser.email}
              </span>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded-full font-bold border border-emerald-100 uppercase">
                RBAC Role: Resource Manager
              </span>
              {activeOutgoingDelegation && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] rounded-full font-bold border border-amber-200 uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>Delegated to {activeOutgoingDelegation.delegateeName}</span>
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-1">
              Billing Approvals & Variance Review for {currentUser.name}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Review assigned consultant invoices. Authorize exceptions, bulk sign-off, delegate authority during leaves, or reject invalid billing lines back to vendors.
            </p>
          </div>

          {/* Manager Actions & Tools Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* Delegation Authority Button */}
            <button
              onClick={() => setShowDelegationModal(true)}
              className="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="Manage Approval Authority Delegation"
            >
              <UserCheck className={`w-3.5 h-3.5 ${activeOutgoingDelegation || activeIncomingDelegations.length > 0 ? 'text-emerald-600' : 'text-slate-500'}`} />
              <span>Delegation</span>
              {(activeOutgoingDelegation || activeIncomingDelegations.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>

            {/* Export Queue Button */}
            <button
              onClick={() => setShowExportModal(true)}
              className="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="Export Current Queue (Excel / CSV / JSON)"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Export</span>
            </button>

            {/* Re-Sync with Timesheets Button */}
            {onResyncWithTimesheets && (
              <button
                onClick={() => onResyncWithTimesheets()}
                className="text-xs px-3 py-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-lg font-medium transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                title="Retroactive Timesheet Diff: Refresh all items with latest approved internal timesheet records"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Re-Sync Timesheets</span>
              </button>
            )}

            {/* Manager Switcher */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
              <label className="text-xs text-slate-500 font-medium hidden sm:inline">Viewing as:</label>
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const found = SAMPLE_USERS.find(u => u.id === e.target.value);
                  if (found) onSelectManager(found);
                }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="user-manager-1">Sarah Jenkins (Cloud Platform)</option>
                <option value="user-manager-2">David Chen (Core Apps)</option>
                <option value="user-manager-3">Elena Rostova (Data Platforms)</option>
              </select>
            </div>

            <button
              onClick={() => setShowAllManagersToggle(!showAllManagersToggle)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                showAllManagersToggle 
                  ? 'bg-slate-900 text-white border-slate-900' 
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showAllManagersToggle ? 'All Managers' : 'Assigned Only'}
            </button>
          </div>
        </div>

        {/* Domain COO Executive Oversight Banner */}
        {currentUser.role === 'domain_coo' && (
          <div className="mt-4 p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-indigo-950">Domain COO Executive Oversight & Delegate Mode</p>
                  <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-indigo-600 text-white uppercase">Domain COO</span>
                </div>
                <p className="text-[11px] text-indigo-800 mt-0.5">
                  You hold executive delegated signing authority for all cost-centers under your domain UBR mapping. You can review, approve variances, or reject lines directly as the executive escalation point.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Delegated Authority Banner (If user is acting on behalf of another manager) */}
        {activeIncomingDelegations.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-900">
                  You are an Authorized Delegate for: {activeIncomingDelegations.map(d => d.delegatorName).join(', ')}
                </p>
                <p className="text-[11px] text-blue-700">
                  Authority granted for timesheet & invoice exceptions. Your decisions will be logged in SAP audit under your credential.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setDelegationScopeFilter('ALL')}
                className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  delegationScopeFilter === 'ALL'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                }`}
              >
                All Resources
              </button>
              <button
                onClick={() => setDelegationScopeFilter('MY_RESOURCES')}
                className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  delegationScopeFilter === 'MY_RESOURCES'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                }`}
              >
                My Direct
              </button>
              <button
                onClick={() => setDelegationScopeFilter('DELEGATED_ONLY')}
                className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  delegationScopeFilter === 'DELEGATED_ONLY'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                }`}
              >
                Delegated Only
              </button>
            </div>
          </div>
        )}

        {/* SLA Escalation Policy Bar */}
        <div className="mt-4 p-3.5 bg-slate-900 text-slate-100 rounded-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white">Reconciliation SLA Governance:</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-400/30 font-mono">Level 1: &gt;4 Working Days → Manager's Manager (VP)</span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-400/30 font-mono">Level 2: &ge;7 Total Days → Domain COO</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Managers must act within 4 working days of reconciliation initiation. After 7 days total elapsed, automated notification is dispatched to Domain COO.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
              <span className="text-[11px] text-slate-400">Simulate Aging:</span>
              <select
                value={simulatedAgingDays}
                onChange={(e) => setSimulatedAgingDays(Number(e.target.value))}
                className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded border border-slate-600 focus:outline-hidden"
              >
                <option value={0}>0 Days (Current Realtime)</option>
                <option value={4}>4 Working Days (Triggers Level 1 VP Escalation)</option>
                <option value={7}>7 Calendar Days (Triggers Level 2 Domain COO Escalation)</option>
                <option value={10}>10 Days (Critical Domain COO Escalation)</option>
              </select>
            </div>

            <button
              onClick={() => {
                let sentCount = 0;
                managerDiscrepancies.forEach(({ batch, item }) => {
                  if (!item.managerDecision && item.status !== 'REJECTED_BY_MANAGER') {
                    const esc = evaluateItemEscalation(item, batch.approvalInitiatedAt, simulatedAgingDays);
                    if (esc.isEscalated && esc.escalationLevel !== 'NONE' && onSendNotification) {
                      const notif = buildEscalationNotification(batch, [item], esc.escalationLevel);
                      onSendNotification(notif);
                      sentCount++;
                    }
                  }
                });
                setEscalationNoticeSentToast(
                  sentCount > 0 
                    ? `Dispatched ${sentCount} automated escalation notification(s) to Skip-Level Managers and Domain COO.`
                    : `No SLA breaches detected for the selected aging offset (${simulatedAgingDays} days).`
                );
                setTimeout(() => setEscalationNoticeSentToast(null), 5000);
              }}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Trigger Escalation Check</span>
            </button>
          </div>
        </div>

        {escalationNoticeSentToast && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs flex items-center justify-between">
            <span>{escalationNoticeSentToast}</span>
            <button onClick={() => setEscalationNoticeSentToast(null)} className="text-xs font-bold text-emerald-700">Dismiss</button>
          </div>
        )}

        {/* Sleek Manager Metrics */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Pending Discrepancies
            </p>
            <p className="text-2xl font-bold text-red-600">{pendingDiscrepanciesCount}</p>
            <p className="text-[10px] text-slate-500 mt-1">Requiring decision</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Vendor Resubmissions
            </p>
            <p className="text-2xl font-bold text-purple-600">{resubmissionsCount}</p>
            <p className="text-[10px] text-purple-600 font-medium mt-1">Corrected & ready for re-approval</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Routine Matched Lines
            </p>
            <p className="text-2xl font-bold text-emerald-600">{managerMatches.length}</p>
            <p className="text-[10px] text-slate-500 mt-1">{pendingMatchesCount} awaiting sign-off</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Net Financial Exposure
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(totalExposure, currentCurrency)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Unbudgeted variance</p>
          </div>
        </div>

        {/* Quick Jump & View Density Control */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={scrollToApprovalQueue}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 active:scale-95"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Jump to Approval Queue ({pendingDiscrepanciesCount} Pending)</span>
            </button>
            <button
              onClick={() => setShowDistributionChart(!showDistributionChart)}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              {showDistributionChart ? 'Hide Status Chart (Compact)' : 'Show Status Chart'}
            </button>
            {onOpenSendReminder && (
              <button
                id="manager-nudge-vendors-btn"
                onClick={() => onOpenSendReminder({ recipientEmail: 'ar-invoicing@apex-global.com' })}
                className="px-3 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                title="Send a reminder to vendor billing team regarding rejected lines or outstanding invoices"
              >
                <BellRing className="w-3.5 h-3.5 text-amber-600" />
                <span>Nudge Vendors</span>
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500 font-medium hidden sm:block">
            Tip: Use 1-Click <span className="text-emerald-700 font-bold">Quick Authorize</span> on cards below to sign off without opening a modal.
          </div>
        </div>
      </div>

      {/* Recharts Dashboard Summary Chart */}
      {showDistributionChart && (
        <InvoiceStatusChart
          batches={batches}
          currentCurrency={currentCurrency}
          portalType="manager"
          managerEmail={showAllManagersToggle ? undefined : currentUser.email}
          onOpenPdfReport={onOpenPdfReport}
        />
      )}

      {/* Queue View Selector Tabs & Batch Action Toolbar */}
      <div id="manager-action-queue" className="scroll-mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveQueueTab('discrepancies')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeQueueTab === 'discrepancies'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Discrepancy Exceptions ({managerDiscrepancies.length})</span>
            {pendingDiscrepanciesCount > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[10px] font-bold">
                {pendingDiscrepanciesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveQueueTab('resubmissions')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeQueueTab === 'resubmissions'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resubmitted Corrections ({resubmissionsCount})</span>
            {resubmissionsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-purple-500 text-white rounded-full text-[10px] font-bold">
                {resubmissionsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveQueueTab('matches')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeQueueTab === 'matches'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Routine Matched Lines ({managerMatches.length})</span>
          </button>
        </div>

        {/* Tab Right Controls */}
        <div className="flex items-center gap-2">
          {currentTabItems.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              {isAllCurrentSelected ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>Select All ({currentTabItems.length})</span>
                </>
              )}
            </button>
          )}

          {activeQueueTab === 'matches' && managerMatches.length > 0 && (
            <button
              onClick={handleSignOffAllRoutineMatches}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>1-Click Sign-Off All ({managerMatches.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: DISCREPANCY EXCEPTIONS */}
      {activeQueueTab === 'discrepancies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>Action Required: Discrepancy Queue</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase">
                {pendingDiscrepanciesCount} Pending
              </span>
              {rejectedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white uppercase">
                  {rejectedCount} Rejected (Vendor Revising)
                </span>
              )}
            </h2>
            <span className="text-xs text-slate-500">
              Select multiple cards below to execute bulk approvals.
            </span>
          </div>

          {managerDiscrepancies.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">No Discrepancies Found</h3>
              <p className="text-xs text-slate-500 mt-1">
                All vendor billing lines match your team's internal approved timesheets perfectly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {managerDiscrepancies.map(({ batch, item }) => {
                const isResolved = !!item.managerDecision && item.status !== 'REJECTED_BY_MANAGER';
                const isRejected = item.status === 'REJECTED_BY_MANAGER';
                const isResubmitted = item.status === 'RESUBMITTED_FOR_REVIEW';
                const isSelected = selectedItemIds.has(item.id);
                const isDelegatedItem = item.managerEmail.toLowerCase() !== currentUser.email.toLowerCase();
                const escalationInfo = evaluateItemEscalation(item, batch.approvalInitiatedAt, simulatedAgingDays);
                const domainCoo = getDomainCooForManager(item.managerEmail, item.department);

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl p-5 shadow-xs transition-all border ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10'
                        : isRejected
                        ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300'
                        : isResubmitted
                        ? 'border-purple-300 bg-purple-50/20'
                        : escalationInfo.escalationLevel === 'LEVEL_2_COO_ESCALATION' && !isResolved
                        ? 'border-purple-300 bg-purple-50/15'
                        : escalationInfo.escalationLevel === 'LEVEL_1_MANAGER_ESCALATION' && !isResolved
                        ? 'border-amber-300 bg-amber-50/15'
                        : isResolved 
                        ? 'border-slate-200' 
                        : 'border-red-200 bg-red-50/10'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      
                      {/* Selection Checkbox + Resource details */}
                      <div className="flex items-start gap-3 flex-1">
                        <div className="pt-0.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            className="w-4 h-4 rounded-sm text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>

                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base text-slate-900">{item.resourceName}</span>
                            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-sm">
                              {item.resourceEmail}
                            </span>

                            {/* Delegated Assignment Tag */}
                            {isDelegatedItem && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-full font-bold border border-blue-200 uppercase flex items-center gap-1">
                                <UserCheck className="w-3 h-3 text-blue-600" />
                                <span>Acting for {item.managerName}</span>
                              </span>
                            )}
                            
                            {/* Variance Type Badges */}
                            {item.discrepancyType === 'DAYS_OVERBILLED' && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-bold border border-red-200 uppercase">
                                +{item.daysVariance} Days Overbilled
                              </span>
                            )}
                            {item.discrepancyType === 'RATE_MISMATCH' && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold border border-amber-200 uppercase">
                                Rate Mismatch
                              </span>
                            )}
                            {item.discrepancyType === 'RESOURCE_NOT_FOUND' && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold border border-purple-200 uppercase">
                                Not in AB DB
                              </span>
                            )}

                            {/* Escalation Badges */}
                            {escalationInfo.escalationLevel === 'LEVEL_1_MANAGER_ESCALATION' && !isResolved && (
                              <span className="px-2 py-0.5 bg-amber-500 text-slate-950 text-[10px] rounded-full font-bold uppercase flex items-center gap-1 shadow-2xs">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Level 1 Escalated ({escalationInfo.elapsedWorkingDays}d &gt; 4d SLA)</span>
                              </span>
                            )}
                            {escalationInfo.escalationLevel === 'LEVEL_2_COO_ESCALATION' && !isResolved && (
                              <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] rounded-full font-bold uppercase flex items-center gap-1 shadow-2xs animate-pulse">
                                <BellRing className="w-3 h-3" />
                                <span>Level 2 Domain COO Escalated ({escalationInfo.elapsedDays}d &ge; 7d)</span>
                              </span>
                            )}

                            {/* Bulk Approved Badge */}
                            {item.managerDecision?.isBulkApproved && (
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] rounded-full font-bold border border-indigo-200 uppercase flex items-center gap-1">
                                <Layers className="w-3 h-3 text-indigo-600" />
                                <span>Bulk Approved</span>
                              </span>
                            )}

                            {/* Rejection / Resubmission Status Badges */}
                            {isRejected && (
                              <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] rounded-full font-bold uppercase animate-pulse">
                                Rejected by Manager (Vendor Revising)
                              </span>
                            )}
                            {isResubmitted && (
                              <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] rounded-full font-bold uppercase">
                                Vendor Corrected (Review Resubmission)
                              </span>
                            )}
                          </div>

                          {/* Level 1 or 2 Escalation Detail Banner */}
                          {escalationInfo.isEscalated && !isResolved && (
                            <div className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                              escalationInfo.escalationLevel === 'LEVEL_2_COO_ESCALATION'
                                ? 'bg-purple-50/80 border-purple-200 text-purple-950'
                                : 'bg-amber-50/80 border-amber-200 text-amber-950'
                            }`}>
                              <div className="flex items-center gap-2">
                                <BellRing className={`w-4 h-4 shrink-0 ${escalationInfo.escalationLevel === 'LEVEL_2_COO_ESCALATION' ? 'text-purple-700' : 'text-amber-700'}`} />
                                <div>
                                  <span className="font-bold">
                                    {escalationInfo.escalationLevel === 'LEVEL_2_COO_ESCALATION' ? 'Domain COO Escalation Triggered:' : 'Skip-Level Escalation Triggered:'}
                                  </span>{' '}
                                  <span>Escalated to <strong>{escalationInfo.escalatedToName}</strong> ({escalationInfo.escalatedToRole} - {escalationInfo.escalatedToEmail})</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/90 border border-current font-bold shrink-0">
                                {escalationInfo.elapsedWorkingDays} working days / {escalationInfo.elapsedDays} calendar days inactive
                              </span>
                            </div>
                          )}

                          <div className="text-xs text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Vendor & PO</span>
                              <span className="font-medium text-slate-800">{item.vendorName}</span>
                              <div className="text-[10px] text-slate-500 font-mono">{item.poNumber}</div>
                              <div className="text-[10px] text-indigo-700 font-medium">UBR: {domainCoo.ubrCode}</div>
                            </div>

                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Billed vs Timesheet</span>
                              <span className="font-semibold text-red-600">{item.billedDays} Billed Days</span>
                              <div className="text-[11px] text-slate-500">vs {item.internalApprovedDays} Approved</div>
                            </div>

                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Daily Rate</span>
                              <span className="font-medium text-slate-800">
                                {formatCurrency(item.claimedDailyRate, currentCurrency)}/day
                              </span>
                              {item.contractDailyRate !== item.claimedDailyRate && (
                                <div className="text-[10px] text-slate-500">
                                  (Contract: {formatCurrency(item.contractDailyRate, currentCurrency)})
                                </div>
                              )}
                            </div>

                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Variance Exposure</span>
                              <span className="font-bold text-red-600 text-sm">
                                +{formatCurrency(item.financialVarianceAmount, currentCurrency)}
                              </span>
                            </div>
                          </div>

                          {/* Rejection Banner on Card */}
                          {isRejected && item.managerDecision && (
                            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs">
                              <div className="flex items-center gap-1.5 text-red-800 font-bold">
                                <XCircle className="w-4 h-4 text-red-600" />
                                <span>Line Item Rejected — Awaiting Revised Timesheet from Vendor</span>
                              </div>
                              <p className="text-red-900 mt-1 italic">
                                Manager Rejection Reason: "{item.managerDecision.justificationNotes}"
                              </p>
                              <p className="text-[10px] text-slate-500 mt-1">
                                An alert notification was sent to {batch.vendorEmail}. Clearance certificate blocked until vendor submits an adjusted line.
                              </p>
                            </div>
                          )}

                          {/* Resubmission History on Card */}
                          {isResubmitted && item.vendorCorrection && (
                            <div className="mt-3 p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs">
                              <div className="flex items-center gap-1.5 text-purple-900 font-bold">
                                <RotateCcw className="w-4 h-4 text-purple-600" />
                                <span>Vendor Resubmitted with Revision:</span>
                              </div>
                              <p className="text-purple-800 mt-1 font-medium">
                                Adjusted from {item.vendorCorrection.originalBilledDays} days to <strong className="underline">{item.billedDays} days</strong>.
                              </p>
                              <p className="text-slate-700 italic mt-0.5">
                                Vendor Note: "{item.vendorCorrection.notes}"
                              </p>
                            </div>
                          )}

                          {/* Resolution details if already resolved */}
                          {isResolved && item.managerDecision && (
                            <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-xs">
                              <div className="flex items-center gap-1.5 text-emerald-800 font-semibold flex-wrap">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>
                                  {item.managerDecision.action === 'APPROVE_VARIANCE' 
                                    ? 'Exception Approved' 
                                    : item.managerDecision.action === 'ADJUST_TO_INTERNAL'
                                    ? 'Adjusted to Internal Timesheet'
                                    : 'Authorized'}
                                </span>
                                <span className="text-slate-500 font-normal">
                                  by {item.managerDecision.decidedByName} on {new Date(item.managerDecision.decidedAt).toLocaleString()}
                                </span>
                                {item.managerDecision.delegatedBy && (
                                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 text-[10px] rounded-sm font-semibold">
                                    on behalf of {item.managerDecision.delegatedBy.delegatorName}
                                  </span>
                                )}
                              </div>
                              <p className="text-emerald-900 mt-1 italic font-medium">
                                "{item.managerDecision.justificationNotes}"
                              </p>
                              <div className="mt-1 font-bold text-slate-800">
                                Final Cleared: {item.managerDecision.finalApprovedDays} Days ({formatCurrency(item.managerDecision.finalApprovedAmount, currentCurrency)})
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="shrink-0 flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {isResubmitted ? (
                          <>
                            <button
                              onClick={() => {
                                onResolveDiscrepancy(
                                  batch.id,
                                  item.id,
                                  'APPROVE_VARIANCE',
                                  'Quick sign-off: Verified and approved vendor corrected resubmission.'
                                );
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                              title="1-Click Approve Vendor Revision"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>1-Click Sign-Off</span>
                            </button>
                            <button
                              id={`review-btn-${item.id}`}
                              onClick={() => handleOpenReviewModal(batch, item)}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Detailed Review</span>
                            </button>
                          </>
                        ) : !isResolved ? (
                          <>
                            <button
                              onClick={() => {
                                onResolveDiscrepancy(
                                  batch.id,
                                  item.id,
                                  'APPROVE_VARIANCE',
                                  'Quick 1-Click Approval: Authorized sprint overtime variance by Resource Manager.'
                                );
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                              title="1-Click Authorize Claimed Days"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>Quick Authorize</span>
                            </button>

                            <button
                              onClick={() => {
                                onResolveDiscrepancy(
                                  batch.id,
                                  item.id,
                                  'ADJUST_TO_INTERNAL',
                                  `Quick 1-Click Adjustment: Capped strictly to internal approved timesheet days (${item.internalApprovedDays} days).`
                                );
                              }}
                              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                              title="1-Click Cap to Internal Timesheet Days"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Cap to Timesheet</span>
                            </button>

                            <button
                              id={`review-btn-${item.id}`}
                              onClick={() => handleOpenReviewModal(batch, item)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-medium shadow-xs transition-colors flex items-center gap-1.5"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Review Modal</span>
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {item.managerDecision?.action === 'REJECT_BILLING' && onOpenSendReminder && (
                              <button
                                onClick={() => onOpenSendReminder({ 
                                  poNumber: batch.poNumber, 
                                  batchId: batch.id, 
                                  item,
                                  recipientEmail: 'ar-invoicing@apex-global.com'
                                })}
                                className="text-xs px-2.5 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-lg font-semibold transition-colors inline-flex items-center gap-1"
                                title="Nudge vendor to submit revised timesheet"
                              >
                                <BellRing className="w-3 h-3 text-rose-600" />
                                <span>Nudge Vendor</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenReviewModal(batch, item)}
                              className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition-colors"
                            >
                              Edit Decision
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RESUBMISSIONS QUEUE */}
      {activeQueueTab === 'resubmissions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>Vendor Resubmissions Desk</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 uppercase">
                {resubmissionsCount} Ready for Re-Approval
              </span>
            </h2>
            <span className="text-xs text-slate-500">
              Vendors corrected their billed days according to manager feedback.
            </span>
          </div>

          {managerResubmissions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">No Resubmissions Pending</h3>
              <p className="text-xs text-slate-500 mt-1">
                There are currently no vendor corrected lines awaiting your secondary sign-off.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {managerResubmissions.map(({ batch, item }) => (
                <div key={item.id} className="bg-white rounded-xl p-5 border border-purple-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-4 h-4 rounded-sm text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-900 text-base">{item.resourceName}</span>
                        <span className="text-xs text-slate-500 font-mono ml-2">{item.resourceEmail}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          onResolveDiscrepancy(
                            batch.id,
                            item.id,
                            'APPROVE_VARIANCE',
                            '1-Click Sign-Off on Vendor Correction Resubmission.'
                          );
                        }}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>1-Click Sign-Off</span>
                      </button>
                      <button
                        onClick={() => handleOpenReviewModal(batch, item)}
                        className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Detailed Review</span>
                      </button>
                    </div>
                  </div>

                  {item.vendorCorrection && (
                    <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-xs space-y-1">
                      <div className="font-bold text-purple-900">
                        Revised Claimed Days: {item.billedDays} Days (Previous: {item.vendorCorrection.originalBilledDays} Days)
                      </div>
                      <p className="text-slate-600 italic">
                        "{item.vendorCorrection.notes}"
                      </p>
                      <div className="text-[10px] text-slate-400">
                        Resubmitted at {new Date(item.vendorCorrection.correctedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ROUTINE MATCHED LINES */}
      {activeQueueTab === 'matches' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="font-bold text-slate-800 text-sm">Routine Matched Resources Sign-Off</h2>
              <p className="text-xs text-slate-500">
                These consultant lines matched internal approved timesheets 100%. Managers can sign off on all routine items.
              </p>
            </div>
            {managerMatches.length > 0 && (
              <button
                onClick={handleSignOffAllRoutineMatches}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Sign Off All ({managerMatches.length})</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllCurrentSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded-sm text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3.5">Resource (Identifier)</th>
                  <th className="px-4 py-3.5">PO & Vendor</th>
                  <th className="px-4 py-3.5 text-center">Approved Days</th>
                  <th className="px-4 py-3.5 text-center">Billed Days</th>
                  <th className="px-4 py-3.5">Rate & Total</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100">
                {managerMatches.map(({ batch, item }) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-4 h-4 rounded-sm text-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900">{item.resourceName}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{item.resourceEmail}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-mono text-slate-700">{item.poNumber}</div>
                      <div className="text-slate-400 text-[10px]">{item.vendorName}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center font-bold text-emerald-700">
                      {item.internalApprovedDays.toFixed(1)}
                    </td>
                    <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                      {item.billedDays.toFixed(1)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-800">
                        {formatCurrency(item.billedTotalAmount, currentCurrency)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        @{formatCurrency(item.contractDailyRate, currentCurrency)}/day
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {item.status === 'APPROVED_ROUTINE' ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                          ✓ Signed Off
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold text-[10px] border border-blue-100">
                          100% Matched (Pending Sign-Off)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {item.status !== 'APPROVED_ROUTINE' ? (
                        <button
                          onClick={() => {
                            onResolveDiscrepancy(
                              batch.id,
                              item.id,
                              'APPROVE_ROUTINE',
                              'Routine internal timesheet verification confirmed.'
                            );
                          }}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-800 hover:underline"
                        >
                          Sign Off
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Approved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FLOATING STICKY BULK ACTION BAR */}
      {selectedItemIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in slide-in-from-bottom duration-200 max-w-2xl w-[92%] sm:w-auto">
          
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
              {selectedItemIds.size}
            </span>
            <span className="text-xs font-bold text-slate-200">
              Lines Selected
            </span>
          </div>

          <div className="h-5 w-px bg-slate-700 hidden sm:block" />

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeQueueTab !== 'matches' ? (
              <>
                <button
                  onClick={() => handleOpenBulkModal('APPROVE_VARIANCE')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs inline-flex items-center gap-1.5"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Bulk Authorize Overtime</span>
                </button>

                <button
                  onClick={() => handleOpenBulkModal('ADJUST_TO_INTERNAL')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs inline-flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Bulk Adjust to Timesheet</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => handleOpenBulkModal('APPROVE_ROUTINE')}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs inline-flex items-center gap-1.5"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Bulk Sign Off Matches</span>
              </button>
            )}

            <button
              onClick={clearSelection}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white font-medium"
            >
              Clear
            </button>
          </div>

        </div>
      )}

      {/* FLOATING QUICK NAVIGATION CONTROLS */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-2 pointer-events-auto">
        {pendingDiscrepanciesCount > 0 && (
          <button
            onClick={scrollToApprovalQueue}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-xs shadow-xl border border-blue-400 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            title="Scroll directly down to pending discrepancy queue"
          >
            <ArrowDown className="w-4 h-4 animate-bounce" />
            <span>{pendingDiscrepanciesCount} Pending Approval</span>
          </button>
        )}
        <button
          onClick={scrollToTop}
          className="px-3.5 py-2 bg-slate-900/85 hover:bg-slate-900 text-white rounded-full font-medium text-xs shadow-lg backdrop-blur-xs flex items-center justify-center gap-1.5 transition-colors self-end"
          title="Scroll back to top"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Top</span>
        </button>
      </div>

      {/* SINGLE ITEM DECISION MODAL */}
      {selectedItemForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Pinned Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Authorize Billing Line
                </h3>
                <p className="text-xs text-slate-500">
                  PO: <span className="font-mono text-slate-700 font-medium">{selectedItemForReview.item.poNumber}</span> | Resource: <span className="font-medium text-slate-800">{selectedItemForReview.item.resourceName}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedItemForReview(null);
                  setModalValidationMsg('');
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              
              {/* Acting as Delegate Notice in Modal */}
              {selectedItemForReview.item.managerEmail.toLowerCase() !== currentUser.email.toLowerCase() && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs flex items-center gap-2 text-blue-900">
                  <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold">Authorized Delegation:</span>
                    <span className="ml-1">You are signing off on behalf of {selectedItemForReview.item.managerName}. Your credential will be tagged in the audit trail.</span>
                  </div>
                </div>
              )}

              {/* If Resubmission, display history in modal */}
              {selectedItemForReview.item.status === 'RESUBMITTED_FOR_REVIEW' && selectedItemForReview.item.vendorCorrection && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-purple-900 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                    <span>Vendor Correction Resubmission</span>
                  </div>
                  <p className="text-purple-800">
                    Vendor revised claimed days to <strong>{selectedItemForReview.item.billedDays} days</strong> (was previously {selectedItemForReview.item.vendorCorrection.originalBilledDays} days).
                  </p>
                  <p className="text-slate-600 italic">
                    Vendor Note: "{selectedItemForReview.item.vendorCorrection.notes}"
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Vendor Claimed</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedItemForReview.item.billedDays} Days</span>
                  <div className="text-slate-500 font-mono text-[11px]">
                    {formatCurrency(selectedItemForReview.item.billedTotalAmount, currentCurrency)}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Internal Approved</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedItemForReview.item.internalApprovedDays} Days</span>
                  <div className="text-slate-500 font-mono text-[11px]">
                    {formatCurrency(selectedItemForReview.item.internalApprovedTotalAmount, currentCurrency)}
                  </div>
                </div>
              </div>

              {/* Action Radios */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Select Manager Action
                </label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    reviewAction === 'APPROVE_VARIANCE' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="action"
                      value="APPROVE_VARIANCE"
                      checked={reviewAction === 'APPROVE_VARIANCE'}
                      onChange={() => setReviewAction('APPROVE_VARIANCE')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        {selectedItemForReview.item.status === 'RESUBMITTED_FOR_REVIEW'
                          ? 'Approve Vendor Revision (Exception Cleared)'
                          : 'Approve Variance (Exception Authorization)'}
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Approve vendor's claimed {selectedItemForReview.item.billedDays} days. Requires justification for SAP Ariba audit.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    reviewAction === 'ADJUST_TO_INTERNAL' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="action"
                      value="ADJUST_TO_INTERNAL"
                      checked={reviewAction === 'ADJUST_TO_INTERNAL'}
                      onChange={() => setReviewAction('ADJUST_TO_INTERNAL')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Adjust to AB Timesheet ({selectedItemForReview.item.internalApprovedDays} Days)</span>
                      <span className="text-slate-500 text-[11px]">
                        Clear clearance certificate strictly at internal timesheet approved days ({selectedItemForReview.item.internalApprovedDays} days).
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    reviewAction === 'REJECT_BILLING' ? 'border-red-500 bg-red-50/50' : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="action"
                      value="REJECT_BILLING"
                      checked={reviewAction === 'REJECT_BILLING'}
                      onChange={() => setReviewAction('REJECT_BILLING')}
                      className="mt-0.5 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="font-bold text-red-700 block">Reject Line (Vendor Must Revise & Re-Invoice)</span>
                      <span className="text-slate-500 text-[11px] block">
                        Clearance certificate will be <strong>blocked</strong>. The vendor receives an immediate alert with your rejection rationale to correct their claimed days.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Justification Textarea with Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Manager Justification & Audit Notes <span className="text-red-500">*</span>
                </label>

                {/* Quick 1-Click Preset Chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-[10px] text-slate-400 font-medium self-center mr-1">Quick Presets:</span>
                  {(QUICK_JUSTIFICATION_TEMPLATES[reviewAction] || []).map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setJustificationNotes(preset);
                        if (modalValidationMsg) setModalValidationMsg('');
                      }}
                      className="text-[10px] px-2 py-1 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 transition-colors text-left"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  required
                  rows={3}
                  value={justificationNotes}
                  onChange={(e) => {
                    setJustificationNotes(e.target.value);
                    if (modalValidationMsg) setModalValidationMsg('');
                  }}
                  placeholder="Provide explicit business rationale for authorizing, adjusting, or rejecting this line..."
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                />

                {modalValidationMsg && (
                  <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>{modalValidationMsg}</span>
                  </div>
                )}

                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Logged by {currentUser.name} ({currentUser.email}) with immutable timestamp for SAP Ariba PO compliance.
                </span>
              </div>

              {/* Warning when rejecting */}
              {reviewAction === 'REJECT_BILLING' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs flex items-start gap-2 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Rejection Workflow Trigger:</span>
                    <span>Upon submission, batch status becomes REJECTED_NEEDS_REVISION. The vendor must open their portal, adjust the days, and resubmit for your re-approval before Ariba clearance is permitted.</span>
                  </div>
                </div>
              )}

            </div>

            {/* Pinned Sticky Footer - ALWAYS visible on screen */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedItemForReview(null);
                  setModalValidationMsg('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleSubmitReview()}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white shadow-xs transition-colors flex items-center gap-1.5 active:scale-95 ${
                  reviewAction === 'REJECT_BILLING'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <CheckCheck className="w-4 h-4" />
                <span>{reviewAction === 'REJECT_BILLING' ? 'Confirm Rejection & Alert Vendor' : 'Submit & Sign Off'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DELEGATION MODAL */}
      <DelegationModal
        isOpen={showDelegationModal}
        onClose={() => setShowDelegationModal(false)}
        currentUser={currentUser}
        delegations={delegations}
        onSaveDelegation={(del) => {
          if (onSaveDelegation) onSaveDelegation(del);
        }}
        onRevokeDelegation={(delId) => {
          if (onRevokeDelegation) onRevokeDelegation(delId);
        }}
      />

      {/* BULK APPROVAL MODAL */}
      <BulkApprovalModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        selectedItems={selectedItemsList}
        currentCurrency={currentCurrency}
        currentUser={currentUser}
        initialAction={bulkModalAction}
        onConfirmBulkApproval={handleConfirmBulkApproval}
      />

      {/* EXPORT MODAL */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        batches={batches}
        currentBatch={batches[0] || null}
        currentCurrency={currentCurrency}
        auditLogs={auditLogs}
        currentUser={currentUser}
      />

    </div>
  );
};
