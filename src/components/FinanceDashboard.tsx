import React, { useState } from 'react';
import { 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Search, 
  ExternalLink,
  History,
  Building2,
  TrendingUp,
  UserCheck,
  CheckSquare,
  Square,
  Clock,
  Layers,
  ShieldCheck,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import { 
  InvoiceBatch, 
  DiscrepancyItem, 
  Currency, 
  AuditLogEntry, 
  UserProfile,
  ApprovalDelegation,
  BulkApprovalAction 
} from '../types';
import { formatCurrency } from '../utils/reconciliationEngine';
import { hasPermission } from '../utils/rbac';
import { ExportModal } from './ExportModal';
import { BulkApprovalModal } from './BulkApprovalModal';
import { DelegationModal } from './DelegationModal';
import { InvoiceStatusChart } from './InvoiceStatusChart';
import { HistoricalTrendView } from './HistoricalTrendView';

interface FinanceDashboardProps {
  currentUser: UserProfile;
  currentCurrency: Currency;
  batches: InvoiceBatch[];
  auditLogs: AuditLogEntry[];
  onOpenClearanceCertificate: (batch: InvoiceBatch) => void;
  onNavigateToManager: (managerEmail: string) => void;
  delegations?: ApprovalDelegation[];
  onBulkResolve?: (
    itemIds: string[],
    action: BulkApprovalAction,
    justification: string
  ) => void;
  onSaveDelegation?: (delegation: ApprovalDelegation) => void;
  onRevokeDelegation?: (delegationId: string) => void;
  onOpenPdfReport?: (batch: InvoiceBatch) => void;
}

export const FinanceDashboard: React.FC<FinanceDashboardProps> = ({
  currentUser,
  currentCurrency,
  batches,
  auditLogs,
  onOpenClearanceCertificate,
  onNavigateToManager,
  delegations = [],
  onBulkResolve,
  onSaveDelegation,
  onRevokeDelegation,
  onOpenPdfReport
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('all');
  const [activeView, setActiveView] = useState<'mismatches' | 'batches' | 'trends' | 'audit'>('mismatches');

  // Modals & Bulk State
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showDelegationModal, setShowDelegationModal] = useState<boolean>(false);
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkActionType, setBulkActionType] = useState<BulkApprovalAction>('APPROVE_VARIANCE');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Aggregate all items across all batches
  const allItems: { batch: InvoiceBatch; item: DiscrepancyItem }[] = [];
  batches.forEach(b => {
    b.items.forEach(item => {
      allItems.push({ batch: b, item });
    });
  });

  // Unresolved mismatches
  const unresolvedMismatches = allItems.filter(({ item }) => 
    item.discrepancyType !== 'PERFECT_MATCH' && !item.managerDecision
  );

  const resolvedMismatches = allItems.filter(({ item }) => 
    item.discrepancyType !== 'PERFECT_MATCH' && !!item.managerDecision
  );

  const totalBilled = batches.reduce((sum, b) => sum + b.totalBilledAmount, 0);
  const totalApproved = batches.reduce((sum, b) => sum + b.totalInternalApprovedAmount, 0);
  const netVarianceExposure = unresolvedMismatches.reduce((sum, { item }) => sum + Math.max(0, item.financialVarianceAmount), 0);

  // Filtered unresolved list
  const filteredUnresolved = unresolvedMismatches.filter(({ item, batch }) => {
    const matchesSearch = 
      item.resourceEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.managerName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesVendor = selectedVendorFilter === 'all' || item.vendorName === selectedVendorFilter;
    const matchesSeverity = selectedSeverityFilter === 'all' || item.severity === selectedSeverityFilter;

    return matchesSearch && matchesVendor && matchesSeverity;
  });

  const uniqueVendors = Array.from(new Set(batches.map(b => b.vendorName)));

  // Multi-Selection helpers
  const isAllFilteredSelected = 
    filteredUnresolved.length > 0 && filteredUnresolved.every(({ item }) => selectedItemIds.has(item.id));

  const toggleSelectAll = () => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (isAllFilteredSelected) {
        filteredUnresolved.forEach(({ item }) => next.delete(item.id));
      } else {
        filteredUnresolved.forEach(({ item }) => next.add(item.id));
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

  const selectedItemsList = allItems
    .map(x => x.item)
    .filter(i => selectedItemIds.has(i.id));

  const handleOpenBulkModal = (action: BulkApprovalAction) => {
    setBulkActionType(action);
    setShowBulkModal(true);
  };

  const handleConfirmBulk = (
    itemIds: string[], 
    action: BulkApprovalAction, 
    justification: string
  ) => {
    if (onBulkResolve) {
      onBulkResolve(itemIds, action, justification);
    }
    setSelectedItemIds(new Set());
  };

  const canExecuteApprovals = hasPermission(currentUser.role, 'APPROVE_DISCREPANCIES');

  return (
    <div className="space-y-6 pb-20">
      
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full font-bold border border-blue-100 uppercase">
                Accounts Payable Oversight
              </span>
              <span className="text-xs text-slate-500 font-mono">
                AB Company Central Ledger
              </span>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] rounded-full font-bold border border-purple-100 uppercase">
                Active Delegations: {delegations.filter(d => d.active).length}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-1">
              Unresolved Billing Mismatch Executive Dashboard
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Comprehensive oversight of vendor invoice variances reconciled against AB Company internal timesheets. Manage financial exposure, execute bulk approvals, and inspect SAP Ariba clearance status.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Printable PDF Audit Report */}
            {onOpenPdfReport && batches.length > 0 && (
              <button
                id="finance-open-pdf-report-btn"
                onClick={() => onOpenPdfReport(batches[0])}
                className="text-xs px-3.5 py-2 bg-slate-900 hover:bg-slate-800 rounded-lg font-bold text-white transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                title="Export current invoice batch summary and clearance certificate as printable PDF report"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Printable Audit PDF</span>
              </button>
            )}

            {/* Delegation Overview */}
            <button
              onClick={() => setShowDelegationModal(true)}
              className="text-xs px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg font-medium text-slate-700 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <UserCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>Delegation Registry ({delegations.filter(d => d.active).length})</span>
            </button>

            {/* Export Reconciliation Package */}
            <button
              onClick={() => setShowExportModal(true)}
              className="text-xs px-3.5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-white transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Package (Excel / CSV / JSON)</span>
            </button>
          </div>
        </div>

        {/* Sleek 4-Grid KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Total Claimed by Vendors
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(totalBilled, currentCurrency)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Across {batches.length} PO Batches</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              AB Timesheet Approved
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(totalApproved, currentCurrency)}
            </p>
            <p className="text-[10px] text-emerald-600 font-medium mt-1">Verified Internal Hours</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Unresolved Mismatch Exposure
            </p>
            <p className="text-2xl font-bold text-red-600">
              +{formatCurrency(netVarianceExposure, currentCurrency)}
            </p>
            <p className="text-[10px] text-red-500 mt-1">{unresolvedMismatches.length} pending line items</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Reconciliation Health
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">
                {allItems.length > 0 
                  ? `${Math.round(((allItems.length - unresolvedMismatches.length) / allItems.length) * 100)}%`
                  : '100%'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-sm">
                Cleared
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {resolvedMismatches.length} resolved exceptions
            </p>
          </div>
        </div>
      </div>

      {/* Organization-wide Dashboard Summary Chart (Recharts) */}
      <InvoiceStatusChart
        batches={batches}
        currentCurrency={currentCurrency}
        portalType="finance"
        onOpenAnalytics={() => setActiveView('trends')}
        onOpenPdfReport={onOpenPdfReport}
      />

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveView('mismatches')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
            activeView === 'mismatches'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Unresolved Mismatches ({unresolvedMismatches.length})</span>
        </button>

        <button
          onClick={() => setActiveView('batches')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
            activeView === 'batches'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Vendor Purchase Orders ({batches.length})</span>
        </button>

        <button
          id="finance-tab-trends"
          onClick={() => setActiveView('trends')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
            activeView === 'trends'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Historical Trends & Analytics</span>
        </button>

        <button
          id="finance-tab-audit"
          onClick={() => setActiveView('audit')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
            activeView === 'audit'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>System Audit Trail ({auditLogs.length})</span>
        </button>
      </div>

      {/* VIEW 1: UNRESOLVED MISMATCHES TABLE */}
      {activeView === 'mismatches' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          
          {/* Table Controls / Filters */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter by Resource Email, PO, or Vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedVendorFilter}
                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
              >
                <option value="all">All Vendors</option>
                {uniqueVendors.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>

              <select
                value={selectedSeverityFilter}
                onChange={(e) => setSelectedSeverityFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
              >
                <option value="all">All Severities</option>
                <option value="CRITICAL">Critical Discrepancies</option>
                <option value="MINOR">Minor Discrepancies</option>
              </select>

              {filteredUnresolved.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs"
                >
                  {isAllFilteredSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      <span>Deselect All</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                      <span>Select All ({filteredUnresolved.length})</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded-sm text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-5 py-4">PO & Vendor</th>
                  <th className="px-5 py-4">Resource & Email ID (Key)</th>
                  <th className="px-5 py-4">Billed vs Timesheet Days</th>
                  <th className="px-5 py-4">Financial Variance</th>
                  <th className="px-5 py-4">Mismatch Reason</th>
                  <th className="px-5 py-4">Responsible Manager</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100">
                {filteredUnresolved.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400 text-xs">
                      No unresolved billing mismatches found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUnresolved.map(({ item, batch }) => {
                    const isSelected = selectedItemIds.has(item.id);
                    return (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        
                        {/* Checkbox */}
                        <td className="px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            className="w-4 h-4 rounded-sm text-blue-600 cursor-pointer"
                          />
                        </td>

                        {/* PO & Vendor */}
                        <td className="px-5 py-4">
                          <div className="font-mono font-bold text-slate-900 text-xs">{item.poNumber}</div>
                          <div className="text-xs text-slate-500">{item.vendorName}</div>
                        </td>

                        {/* Resource */}
                        <td className="px-5 py-4">
                          <div className="font-medium text-slate-800">{item.resourceEmail}</div>
                          <div className="text-xs text-slate-400">{item.resourceName}</div>
                        </td>

                        {/* Days comparison */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-red-600 text-xs">
                            {item.billedDays} Billed vs {item.internalApprovedDays} Approved
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Variance: {item.daysVariance > 0 ? `+${item.daysVariance}` : item.daysVariance} Days
                          </div>
                        </td>

                        {/* Financial Variance */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-red-600 text-xs">
                            +{formatCurrency(item.financialVarianceAmount, currentCurrency)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Claimed: {formatCurrency(item.billedTotalAmount, currentCurrency)}
                          </div>
                        </td>

                        {/* Discrepancy Reason */}
                        <td className="px-5 py-4">
                          {item.discrepancyType === 'DAYS_OVERBILLED' && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-bold uppercase">
                              +{item.daysVariance} Days Overbilled
                            </span>
                          )}
                          {item.discrepancyType === 'RATE_MISMATCH' && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold uppercase">
                              Rate Variance
                            </span>
                          )}
                          {item.discrepancyType === 'RESOURCE_NOT_FOUND' && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold uppercase">
                              Unmapped Resource
                            </span>
                          )}
                        </td>

                        {/* Manager */}
                        <td className="px-5 py-4">
                          <div className="font-medium text-slate-800">{item.managerName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.managerEmail}</div>
                        </td>

                        {/* Route to Manager Review */}
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => onNavigateToManager(item.managerEmail)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <span>Review</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: VENDOR PO BATCHES */}
      {activeView === 'batches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {batches.map(batch => (
            <div key={batch.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-sm">
                    {batch.poNumber}
                  </span>
                  <h3 className="font-bold text-sm text-slate-900 mt-1">{batch.vendorName}</h3>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${
                    batch.status === 'CLEARED_FOR_ARIBA'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : batch.approvalFlowInitiated
                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {batch.status === 'CLEARED_FOR_ARIBA'
                      ? 'Cleared for Ariba'
                      : batch.approvalFlowInitiated
                      ? 'In Review'
                      : 'Draft'}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    Period: {batch.billingMonth}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Billed</span>
                  <span className="font-bold text-slate-900">{formatCurrency(batch.totalBilledAmount, currentCurrency)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Timesheet</span>
                  <span className="font-bold text-slate-800">{formatCurrency(batch.totalInternalApprovedAmount, currentCurrency)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Net Variance</span>
                  <span className={`font-bold ${batch.netVarianceAmount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    +{formatCurrency(batch.netVarianceAmount, currentCurrency)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">
                  {batch.discrepancyItemsCount} Discrepancies ({batch.matchedItemsCount} Matched)
                </span>
                <div className="flex items-center gap-3">
                  {onOpenPdfReport && (
                    <button
                      onClick={() => onOpenPdfReport(batch)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-blue-600 cursor-pointer"
                      title="Printable PDF Audit Report"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      <span>Audit PDF</span>
                    </button>
                  )}
                  <button
                    onClick={() => onOpenClearanceCertificate(batch)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ariba Clearance</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 3: HISTORICAL TRENDS & ANALYTICS */}
      {activeView === 'trends' && (
        <HistoricalTrendView
          batches={batches}
          currentCurrency={currentCurrency}
          onOpenPdfReport={onOpenPdfReport}
        />
      )}

      {/* VIEW 4: AUDIT LOG */}
      {activeView === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span>Immutable System Audit Trail</span>
          </h3>
          <div className="divide-y divide-slate-100 text-xs">
            {auditLogs.map(log => (
              <div key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{log.action}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 font-medium">{log.actorName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({log.actorEmail})</span>
                    {log.action.startsWith('DELEGATION') && (
                      <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-sm">
                        Delegation Rule
                      </span>
                    )}
                    {log.action.startsWith('BULK') && (
                      <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded-sm">
                        Bulk Operation
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">{log.details}</p>
                </div>
                <div className="text-[10px] text-slate-400 font-mono shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FLOATING BULK BAR FOR FINANCE */}
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

          <div className="flex items-center gap-2 flex-wrap">
            {canExecuteApprovals && (
              <>
                <button
                  onClick={() => handleOpenBulkModal('APPROVE_VARIANCE')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Authorize Variances</span>
                </button>

                <button
                  onClick={() => handleOpenBulkModal('ADJUST_TO_INTERNAL')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs inline-flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Adjust to Internal</span>
                </button>
              </>
            )}

            <button
              onClick={() => setSelectedItemIds(new Set())}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white font-medium"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        batches={batches}
        currentBatch={batches[0] || null}
        currentCurrency={currentCurrency}
        auditLogs={auditLogs}
        currentUser={currentUser}
        onOpenPdfReport={onOpenPdfReport}
      />

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
        initialAction={bulkActionType}
        onConfirmBulkApproval={handleConfirmBulk}
      />

    </div>
  );
};
