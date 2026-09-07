import React, { useState, useMemo } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  PieChart as PieIcon, 
  BarChart3, 
  DollarSign, 
  Layers, 
  Filter,
  TrendingUp,
  Info,
  X,
  ExternalLink,
  Maximize2,
  AlertTriangle,
  Building2
} from 'lucide-react';
import { InvoiceBatch, DiscrepancyItem, Currency } from '../types';
import { formatCurrency } from '../utils/reconciliationEngine';
import { HistoricalTrendView, MetricMode } from './HistoricalTrendView';

export interface InvoiceStatusChartProps {
  batches: InvoiceBatch[];
  currentCurrency: Currency;
  portalType: 'vendor' | 'manager' | 'finance';
  managerEmail?: string;
  vendorEmail?: string;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  title?: string;
  description?: string;
  compact?: boolean;
  onOpenAnalytics?: () => void;
  onOpenPdfReport?: (batch: InvoiceBatch) => void;
}

interface StatusBucket {
  name: string;
  key: 'pending' | 'approved' | 'rejected';
  count: number;
  amount: number;
  color: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  description: string;
}

export const InvoiceStatusChart: React.FC<InvoiceStatusChartProps> = ({
  batches,
  currentCurrency,
  portalType,
  managerEmail,
  vendorEmail,
  selectedMonth: externalSelectedMonth,
  onMonthChange: externalOnMonthChange,
  title,
  description,
  compact = false,
  onOpenAnalytics,
  onOpenPdfReport
}) => {
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<MetricMode>('spend_variance');

  // Available billing months extracted dynamically from batches
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    batches.forEach(b => {
      if (b.billingMonth) monthSet.add(b.billingMonth);
    });
    // Ensure standard demonstration months exist
    monthSet.add('2026-08');
    monthSet.add('2026-07');
    monthSet.add('2026-06');
    return Array.from(monthSet).sort().reverse();
  }, [batches]);

  // Internal month state if not controlled externally
  const [internalMonth, setInternalMonth] = useState<string>(
    externalSelectedMonth || availableMonths[0] || '2026-08'
  );

  const activeMonth = externalSelectedMonth !== undefined ? externalSelectedMonth : internalMonth;

  const handleMonthChange = (month: string) => {
    if (externalOnMonthChange) {
      externalOnMonthChange(month);
    } else {
      setInternalMonth(month);
    }
  };

  const [chartMode, setChartMode] = useState<'donut' | 'bar'>('donut');

  // Filter batches and items according to portal context & selected month
  const { filteredItems, matchingBatches, statusData, totalItems, totalAmount } = useMemo(() => {
    // Filter batches by selected month (or all)
    const monthBatches = batches.filter(b => {
      if (activeMonth === 'ALL') return true;
      return b.billingMonth === activeMonth;
    });

    // Flatten line items from relevant batches
    let items: DiscrepancyItem[] = [];
    monthBatches.forEach(b => {
      items = items.concat(b.items);
    });

    // Portal-specific item filtering
    if (portalType === 'vendor' && vendorEmail) {
      // Keep items from batches belonging to this vendor
      const vendorBatchIds = new Set(
        monthBatches
          .filter(b => b.vendorEmail?.toLowerCase() === vendorEmail.toLowerCase())
          .map(b => b.id)
      );
      if (vendorBatchIds.size > 0) {
        items = items.filter(item => vendorBatchIds.has(item.batchId));
      }
    } else if (portalType === 'manager' && managerEmail) {
      items = items.filter(item => 
        item.managerEmail.toLowerCase() === managerEmail.toLowerCase()
      );
    }

    // Classify each item into Pending, Approved, or Rejected
    let pendingCount = 0;
    let pendingAmount = 0;
    let approvedCount = 0;
    let approvedAmount = 0;
    let rejectedCount = 0;
    let rejectedAmount = 0;

    items.forEach(item => {
      const isApproved = 
        item.status === 'APPROVED_WITH_EXCEPTION' ||
        item.status === 'ADJUSTED_TO_TIMESHEET' ||
        item.status === 'APPROVED_ROUTINE' ||
        item.status === 'AUTO_MATCHED' ||
        (item.discrepancyType === 'PERFECT_MATCH' && !!item.managerDecision?.action);

      const isRejected = item.status === 'REJECTED_BY_MANAGER';

      const isPending = !isApproved && !isRejected;

      if (isApproved) {
        approvedCount++;
        const amt = item.managerDecision?.finalApprovedAmount !== undefined
          ? item.managerDecision.finalApprovedAmount
          : (item.billedDays * item.claimedDailyRate);
        approvedAmount += amt;
      } else if (isRejected) {
        rejectedCount++;
        rejectedAmount += (item.billedDays * item.claimedDailyRate);
      } else {
        pendingCount++;
        pendingAmount += (item.billedDays * item.claimedDailyRate);
      }
    });

    const totalCount = pendingCount + approvedCount + rejectedCount;
    const totalVal = pendingAmount + approvedAmount + rejectedAmount;

    const data: StatusBucket[] = [
      {
        name: 'Pending Review',
        key: 'pending',
        count: pendingCount,
        amount: pendingAmount,
        color: '#F59E0B', // Amber
        badgeBg: 'bg-amber-50',
        badgeText: 'text-amber-800',
        borderColor: 'border-amber-200',
        description: portalType === 'vendor' 
          ? 'Awaiting resource manager sign-off' 
          : portalType === 'manager' 
          ? 'Requires your team review or authorization' 
          : 'Pending department manager actions'
      },
      {
        name: 'Approved / Cleared',
        key: 'approved',
        count: approvedCount,
        amount: approvedAmount,
        color: '#10B981', // Emerald
        badgeBg: 'bg-emerald-50',
        badgeText: 'text-emerald-800',
        borderColor: 'border-emerald-200',
        description: 'Signed off and eligible for Ariba clearance'
      },
      {
        name: 'Rejected / Revision',
        key: 'rejected',
        count: rejectedCount,
        amount: rejectedAmount,
        color: '#EF4444', // Rose / Red
        badgeBg: 'bg-red-50',
        badgeText: 'text-red-800',
        borderColor: 'border-red-200',
        description: 'Rejected by manager; requires vendor revision'
      }
    ];

    return {
      filteredItems: items,
      matchingBatches: monthBatches,
      statusData: data,
      totalItems: totalCount,
      totalAmount: totalVal
    };
  }, [batches, activeMonth, portalType, managerEmail, vendorEmail]);

  // Formatted title based on portal
  const defaultTitle = 
    portalType === 'vendor' 
      ? 'Vendor Invoice Status Distribution' 
      : portalType === 'manager' 
      ? 'Assigned Resource Status Distribution' 
      : 'Company-Wide Invoice Status Distribution';

  const defaultDescription = 
    portalType === 'vendor'
      ? `Real-time breakdown of your invoice line items for ${activeMonth === 'ALL' ? 'all months' : activeMonth}.`
      : portalType === 'manager'
      ? `Review status for consultant timesheet approvals under your reporting hierarchy for ${activeMonth === 'ALL' ? 'all months' : activeMonth}.`
      : `Executive clearance and audit status distribution for ${activeMonth === 'ALL' ? 'all months' : activeMonth}.`;

  // Custom Tooltip for recharts
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as StatusBucket;
      const pct = totalItems > 0 ? ((data.count / totalItems) * 100).toFixed(1) : '0';
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 z-50">
          <div className="flex items-center gap-2 font-bold">
            <span 
              className="w-2.5 h-2.5 rounded-full inline-block" 
              style={{ backgroundColor: data.color }} 
            />
            <span>{data.name}</span>
          </div>
          <div className="text-slate-300 font-mono text-[11px] pt-0.5 space-y-0.5">
            <div>Lines / Items: <strong className="text-white">{data.count}</strong> ({pct}% of month)</div>
            <div>Billed Value: <strong className="text-white">{formatCurrency(data.amount, currentCurrency)}</strong></div>
          </div>
          <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1">
            {data.description}
          </div>
        </div>
      );
    }
    return null;
  };

  const monthLabel = (m: string) => {
    if (m === 'ALL') return 'All Historical Months';
    const [year, month] = m.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5 transition-all">
      {/* Header with Month Selector and View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200 uppercase tracking-wider">
              {portalType === 'vendor' ? 'Vendor Portal' : portalType === 'manager' ? 'Manager Review' : 'Corporate AP'}
            </span>
            <button
              type="button"
              id={`recharts-analytics-btn-${portalType}`}
              onClick={() => {
                setActiveAnalyticsTab('spend_variance');
                setShowAnalyticsModal(true);
                if (onOpenAnalytics) {
                  onOpenAnalytics();
                }
              }}
              className="text-xs px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg border border-blue-200 transition-all inline-flex items-center gap-1.5 shadow-2xs cursor-pointer hover:shadow-xs active:scale-95 group"
              title="Click to launch interactive Recharts Analytics suite: Historical spend curves, variance trends, and discrepancy breakdown"
            >
              <TrendingUp className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
              <span>Recharts Analytics</span>
              <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.2 rounded-full font-bold">Open</span>
            </button>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
            {title || defaultTitle}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {description || defaultDescription}
          </p>
        </div>

        {/* Controls: Month Dropdown + Chart Type Toggle */}
        <div className="flex items-center gap-2.5 self-start sm:self-center">
          {/* Month Selector */}
          <div className="relative inline-flex items-center">
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              id={`month-selector-${portalType}`}
              value={activeMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-slate-50 hover:bg-slate-100/80 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-2xs transition-colors"
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {monthLabel(m)} ({m})
                </option>
              ))}
              <option value="ALL">All Available Months</option>
            </select>
          </div>

          {/* Toggle Donut / Bar */}
          <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              id={`chart-toggle-donut-${portalType}`}
              onClick={() => setChartMode('donut')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                chartMode === 'donut' 
                  ? 'bg-white text-blue-600 shadow-2xs font-semibold' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Donut Distribution View"
            >
              <PieIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id={`chart-toggle-bar-${portalType}`}
              onClick={() => setChartMode('bar')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                chartMode === 'bar' 
                  ? 'bg-white text-blue-600 shadow-2xs font-semibold' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Bar Chart Volume View"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {totalItems === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
          <Filter className="w-8 h-8 text-slate-300 mb-2" />
          <p className="font-semibold text-slate-600">No invoice records found for {monthLabel(activeMonth)}</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
            Try selecting another billing month (e.g. 2026-08) or upload an invoice batch for this period.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 items-center">
          
          {/* Recharts Visualization (Left: 7 cols) */}
          <div className="lg:col-span-6 h-[230px] w-full flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'donut' ? (
                <PieChart>
                  <Tooltip content={<CustomTooltip />} />
                  <Pie
                    data={statusData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {statusData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value) => <span className="text-[11px] font-medium text-slate-700">{value}</span>}
                  />
                </PieChart>
              ) : (
                <BarChart data={statusData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    interval={0}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>

            {/* Center Donut Label */}
            {chartMode === 'donut' && (
              <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <div className="text-xl font-extrabold text-slate-900 leading-tight">
                  {totalItems}
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Total Lines
                </div>
              </div>
            )}
          </div>

          {/* Status Breakdown Cards (Right: 6 cols) */}
          <div className="lg:col-span-6 space-y-2.5">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between pb-1">
              <span>Status Distribution ({monthLabel(activeMonth)})</span>
              <span className="text-[11px] font-mono text-slate-500 font-normal">
                Net: {formatCurrency(totalAmount, currentCurrency)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5">
              {statusData.map((item) => {
                const percentage = totalItems > 0 ? Math.round((item.count / totalItems) * 100) : 0;
                return (
                  <div
                    key={item.key}
                    className={`p-3 rounded-xl border ${item.borderColor} ${item.badgeBg} flex items-center justify-between transition-all hover:shadow-2xs`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: item.color }} 
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${item.badgeText}`}>
                            {item.name}
                          </span>
                          <span className="text-[10px] bg-white/80 px-1.5 py-0.2 rounded font-mono text-slate-600 border border-slate-200">
                            {percentage}%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <div className="text-sm font-bold text-slate-900">
                        {item.count} <span className="text-[10px] font-normal text-slate-500">lines</span>
                      </div>
                      <div className="text-[11px] font-mono font-semibold text-slate-700">
                        {formatCurrency(item.amount, currentCurrency)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Clearance Rate Bar */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                  <span>Approval Progress</span>
                </span>
                <span className="font-bold text-slate-800">
                  {totalItems > 0 ? Math.round((statusData[1].count / totalItems) * 100) : 0}% Complete
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  style={{ width: `${totalItems > 0 ? (statusData[1].count / totalItems) * 100 : 0}%` }}
                  title="Approved"
                />
                <div 
                  className="bg-amber-400 h-full transition-all duration-500" 
                  style={{ width: `${totalItems > 0 ? (statusData[0].count / totalItems) * 100 : 0}%` }}
                  title="Pending"
                />
                <div 
                  className="bg-red-400 h-full transition-all duration-500" 
                  style={{ width: `${totalItems > 0 ? (statusData[2].count / totalItems) * 100 : 0}%` }}
                  title="Rejected"
                />
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Interactive Recharts Analytics Modal */}
      {showAnalyticsModal && (
        <div 
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          onClick={() => setShowAnalyticsModal(false)}
        >
          <div 
            className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Recharts Analytics Suite
                    </span>
                    <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active Mode:
                      <strong className="text-blue-700 font-semibold ml-0.5">
                        {activeAnalyticsTab === 'spend_variance' && 'Interactive Spend & Variance Engine'}
                        {activeAnalyticsTab === 'match_accuracy' && 'Reconciliation Match Accuracy'}
                        {activeAnalyticsTab === 'root_causes' && 'Root-Cause Exception Diagnostics'}
                        {activeAnalyticsTab === 'vendor_scorecards' && 'Vendor Longitudinal Risk Matrix'}
                      </strong>
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                    Historical Reconciliation Trends & Variance Analytics
                  </h2>
                </div>
              </div>

              {/* Interactive Engine Switcher Tabs */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold gap-1">
                  <button
                    type="button"
                    id="analytics-tab-spend-variance"
                    onClick={() => setActiveAnalyticsTab('spend_variance')}
                    className={`px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                      activeAnalyticsTab === 'spend_variance'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    title="Interactive Spend & Variance Engine"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Interactive Spend & Variance Engine</span>
                  </button>

                  <button
                    type="button"
                    id="analytics-tab-match-accuracy"
                    onClick={() => setActiveAnalyticsTab('match_accuracy')}
                    className={`px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                      activeAnalyticsTab === 'match_accuracy'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    title="Match Accuracy & Straight-Through Clearance"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Match Accuracy</span>
                  </button>

                  <button
                    type="button"
                    id="analytics-tab-root-causes"
                    onClick={() => setActiveAnalyticsTab('root_causes')}
                    className={`px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                      activeAnalyticsTab === 'root_causes'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    title="Root Causes Exception Analysis"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Root Causes</span>
                  </button>

                  <button
                    type="button"
                    id="analytics-tab-vendor-matrix"
                    onClick={() => setActiveAnalyticsTab('vendor_scorecards')}
                    className={`px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                      activeAnalyticsTab === 'vendor_scorecards'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    title="Vendor Longitudinal Risk Matrix"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Vendor Matrix</span>
                  </button>
                </div>

                <button
                  type="button"
                  id="close-analytics-modal-btn"
                  onClick={() => setShowAnalyticsModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer ml-1"
                  title="Close Recharts Analytics Window"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body with full Recharts analytics */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <HistoricalTrendView
                batches={batches}
                currentCurrency={currentCurrency}
                initialVendorFilter={vendorEmail ? undefined : 'all'}
                activeMetricMode={activeAnalyticsTab}
                onMetricModeChange={setActiveAnalyticsTab}
                onOpenPdfReport={onOpenPdfReport}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
