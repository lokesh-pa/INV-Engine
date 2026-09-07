import React, { useState } from 'react';
import { 
  X, 
  CheckSquare, 
  AlertTriangle, 
  ShieldCheck, 
  Users, 
  DollarSign, 
  FileText,
  Clock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { DiscrepancyItem, Currency, BulkApprovalAction, UserProfile } from '../types';
import { formatCurrency } from '../utils/reconciliationEngine';

interface BulkApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: DiscrepancyItem[];
  currentCurrency: Currency;
  currentUser: UserProfile;
  initialAction?: BulkApprovalAction;
  onConfirmBulkApproval: (
    itemIds: string[], 
    action: BulkApprovalAction, 
    justification: string
  ) => void;
}

export const BulkApprovalModal: React.FC<BulkApprovalModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  currentCurrency,
  currentUser,
  initialAction = 'APPROVE_VARIANCE',
  onConfirmBulkApproval
}) => {
  const [action, setAction] = useState<BulkApprovalAction>(initialAction);
  const [justification, setJustification] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || selectedItems.length === 0) return null;

  // Aggregate stats
  const totalBilledDays = selectedItems.reduce((sum, i) => sum + i.billedDays, 0);
  const totalInternalDays = selectedItems.reduce((sum, i) => sum + i.internalApprovedDays, 0);
  const totalVarianceDays = +(totalBilledDays - totalInternalDays).toFixed(2);
  const totalFinancialVariance = selectedItems.reduce((sum, i) => sum + Math.max(0, i.financialVarianceAmount), 0);
  const totalBilledAmount = selectedItems.reduce((sum, i) => sum + i.billedTotalAmount, 0);

  // Quick preset templates for rapid enterprise justification
  const presetReasons: { [key in BulkApprovalAction]: string[] } = {
    APPROVE_VARIANCE: [
      'Overtime authorized by Lead for Q3 critical sprint deployment and zero-trust launch.',
      'Approved emergency architecture fixes and weekend platform maintenance.',
      'Scope expansion authorized under Master Services Agreement addendum.',
      'Verified deliverable completion and signed off by lead engineer.'
    ],
    ADJUST_TO_INTERNAL: [
      'Billing capped strictly to AB Company Master Approved Timesheet records.',
      'Unauthorized overtime not pre-cleared; settling to internal signed hours.',
      'Contractor logged hours outside approved SOW scope; adjusted to internal cap.'
    ],
    APPROVE_ROUTINE: [
      'Routine 100% timesheet reconciliation verified and approved for invoice clearance.',
      'Internal delivery milestones verified against approved contract deliverables.'
    ]
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      onConfirmBulkApproval(
        selectedItems.map(i => i.id),
        action,
        justification.trim()
      );
      setIsSubmitting(false);
      onClose();
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Bulk Line Approval & Sign-Off</h2>
                <span className="px-2 py-0.5 bg-blue-500/30 text-blue-200 text-[10px] font-bold rounded-full border border-blue-400/30">
                  {selectedItems.length} Selected
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Execute collective authorization and audit sign-off across multiple consultant lines
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

        {/* Modal Form Content */}
        <form id="bulk-approval-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Selected Lines</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{selectedItems.length} Resources</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{totalBilledDays} total days</p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Net Days Variance</p>
              <p className="text-lg font-bold text-amber-900 mt-0.5">
                {totalVarianceDays >= 0 ? `+${totalVarianceDays}` : totalVarianceDays} Days
              </p>
              <p className="text-[10px] text-amber-700 mt-0.5">vs AB timesheets</p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Variance Exposure</p>
              <p className="text-lg font-bold text-blue-900 mt-0.5">
                {formatCurrency(totalFinancialVariance, currentCurrency)}
              </p>
              <p className="text-[10px] text-blue-700 mt-0.5">Total: {formatCurrency(totalBilledAmount, currentCurrency)}</p>
            </div>
          </div>

          {/* Action Choice Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Select Collective Action to Apply
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* Option 1: Approve Variance */}
              <div 
                onClick={() => setAction('APPROVE_VARIANCE')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  action === 'APPROVE_VARIANCE'
                    ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-600/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900">1. Authorize Overtime / Variances</span>
                  <input 
                    type="radio" 
                    name="bulkAction" 
                    checked={action === 'APPROVE_VARIANCE'} 
                    onChange={() => setAction('APPROVE_VARIANCE')}
                    className="text-blue-600" 
                  />
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Approve vendor claimed days and absorb the {formatCurrency(totalFinancialVariance, currentCurrency)} variance as authorized exception.
                </p>
              </div>

              {/* Option 2: Adjust to Timesheet */}
              <div 
                onClick={() => setAction('ADJUST_TO_INTERNAL')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  action === 'ADJUST_TO_INTERNAL'
                    ? 'bg-amber-50/70 border-amber-600 ring-2 ring-amber-600/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900">2. Adjust to Approved Timesheets</span>
                  <input 
                    type="radio" 
                    name="bulkAction" 
                    checked={action === 'ADJUST_TO_INTERNAL'} 
                    onChange={() => setAction('ADJUST_TO_INTERNAL')}
                    className="text-amber-600" 
                  />
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Cap all selected rows strictly to internal timesheets ({totalInternalDays} total days). Eliminates variance exposure.
                </p>
              </div>

            </div>
          </div>

          {/* Selected Items Scrollable List */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Affected Line Items ({selectedItems.length})
            </label>
            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
              {selectedItems.map((item, idx) => (
                <div key={item.id} className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-white transition-colors">
                  <div className="min-w-0 pr-3">
                    <p className="font-semibold text-slate-800 truncate">{item.resourceName}</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate">{item.resourceEmail} • {item.poNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-bold ${item.daysVariance > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {item.billedDays}d billed ({item.daysVariance >= 0 ? `+${item.daysVariance}d` : `${item.daysVariance}d`})
                    </span>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {formatCurrency(item.financialVarianceAmount, currentCurrency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Justification Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Mandatory Audit Justification <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400">Required for SAP Ariba audit compliance</span>
            </div>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Provide clear rationale for applying this bulk decision across selected lines..."
              rows={3}
              className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 resize-none shadow-2xs"
              required
            />

            {/* Quick-Pick Templates */}
            <div className="mt-2">
              <p className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Quick-Insert Justification Templates:</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {presetReasons[action].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setJustification(preset)}
                    className="text-[10px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-left"
                  >
                    "{preset.slice(0, 48)}..."
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer Controls - Pinned Sticky at Bottom */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Signed by <strong>{currentUser.name}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bulk-approval-form"
              disabled={!justification.trim() || isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <span>Execute Bulk Action ({selectedItems.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
