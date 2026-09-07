import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  X, 
  Check, 
  Minus, 
  AlertTriangle, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Mail, 
  FileCheck2,
  Lock,
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { Role, UserProfile } from '../types';
import { SAMPLE_USERS } from '../data/mockCentralDb';

interface RbacPolicyModalProps {
  isOpen?: boolean;
  currentRole: Role;
  onClose: () => void;
  onSwitchRole?: (role: Role) => void;
  onSelectUser?: (user: UserProfile) => void;
  onNavigateTab?: (tab: string) => void;
}

export const RbacPolicyModal: React.FC<RbacPolicyModalProps> = ({
  isOpen = true,
  currentRole,
  onClose,
  onSwitchRole,
  onSelectUser,
  onNavigateTab
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'rejectionWorkflow'>('matrix');

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (isOpen === false) {
    return null;
  }

  const handleRoleQuickSwitch = (targetRole: Role, targetTab: string) => {
    const targetUser = SAMPLE_USERS.find(u => u.role === targetRole) || SAMPLE_USERS[0];
    if (onSelectUser) onSelectUser(targetUser);
    if (onSwitchRole) onSwitchRole(targetRole);
    if (onNavigateTab) onNavigateTab(targetTab);
    onClose();
  };

  const permissionsMatrix = [
    {
      capability: 'Upload Vendor Invoices (Excel/CSV)',
      category: 'Invoicing & Upload',
      vendor: true,
      manager: false,
      admin: true,
      note: 'Vendors upload their raw billing records for reconciliation against AB timesheets.'
    },
    {
      capability: 'View Own Reconciliation Status & PO Batches',
      category: 'Invoicing & Upload',
      vendor: true,
      manager: false,
      admin: true,
      note: 'Vendors can only access batches belonging to their registered Vendor Name/PO.'
    },
    {
      capability: 'Correct Invoice Discrepancy Lines (Before Submission)',
      category: 'Workflow & Corrections',
      vendor: true,
      manager: false,
      admin: true,
      note: 'Vendors can align billed days to approved timesheet limits prior to triggering approval.'
    },
    {
      capability: 'Trigger Approval Flow (All Matches & Discrepancies)',
      category: 'Workflow & Corrections',
      vendor: true,
      manager: false,
      admin: true,
      note: 'Submits entire batch into manager queue; system warns if uncorrected discrepancies exist.'
    },
    {
      capability: 'Review Assigned Resource Line Items',
      category: 'Approval & Sign-off',
      vendor: false,
      manager: true,
      admin: true,
      note: 'Managers can only review contractors in their assigned department or reporting line.'
    },
    {
      capability: '1-Click Routine Sign-Off on Matched Lines',
      category: 'Approval & Sign-off',
      vendor: false,
      manager: true,
      admin: true,
      note: 'Managers routinely approve 100% matched timesheet lines in one click.'
    },
    {
      capability: 'Approve Discrepancy with Variance Exception',
      category: 'Approval & Sign-off',
      vendor: false,
      manager: true,
      admin: true,
      note: 'Requires mandatory business justification note (e.g. offline overtime authorization).'
    },
    {
      capability: 'Adjust Billed Days Down to Approved Timesheet',
      category: 'Approval & Sign-off',
      vendor: false,
      manager: true,
      admin: true,
      note: 'Authoritatively enforces internal timesheet hours over vendor billing.'
    },
    {
      capability: 'Reject Line Item Back to Vendor for Revision',
      category: 'Approval & Sign-off',
      vendor: false,
      manager: true,
      admin: true,
      note: 'Rejects invalid line item, halting Ariba clearance and notifying vendor to revise.'
    },
    {
      capability: 'Revise & Resubmit Rejected Line Items',
      category: 'Workflow & Corrections',
      vendor: true,
      manager: false,
      admin: true,
      note: 'Vendor corrects rejected days/rates in portal and submits for manager re-approval.'
    },
    {
      capability: 'Manage Central Timesheet Master Database',
      category: 'Administration & Governance',
      vendor: false,
      manager: false,
      admin: true,
      note: 'Only Administrators can add, edit, or import central internal approved timesheets.'
    },
    {
      capability: 'Issue / Revoke SAP Ariba Clearance Certificate',
      category: 'Administration & Governance',
      vendor: false, // Vendor can only view/download once approved
      manager: false,
      admin: true,
      note: 'Generated automatically when 100% approved; Admin can override or audit.'
    },
    {
      capability: 'Inspect Immutable Security Audit Logs',
      category: 'Administration & Governance',
      vendor: false,
      manager: false,
      admin: true,
      note: 'Complete audit trail of all upload, approval, rejection, and modification events.'
    }
  ];

  return (
    <div 
      id="rbac-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] cursor-default"
      >
        
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Role-Based Access Control (RBAC) & Approval Policy
                </h2>
                <span className="px-2 py-0.5 bg-blue-500/30 text-blue-200 text-[10px] rounded-full font-bold border border-blue-400/30 uppercase">
                  Enterprise Security
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Segregation of Duties (SoD) between Vendors, Resource Managers, and Corporate Administrators.
              </p>
            </div>
          </div>

          <button
            id="rbac-modal-close-icon"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            title="Close Policy Matrix (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-6 shrink-0">
          <button
            onClick={() => setActiveSubTab('matrix')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors ${
              activeSubTab === 'matrix'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Permissions Matrix (Vendor vs. Manager vs. Admin)
          </button>

          <button
            onClick={() => setActiveSubTab('rejectionWorkflow')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeSubTab === 'rejectionWorkflow'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rejection & Revision Lifecycle</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {activeSubTab === 'matrix' ? (
            <div className="space-y-4">
              
              {/* Role Cards with 1-Click Launch Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${currentRole === 'vendor' ? 'bg-purple-50/70 border-purple-300 ring-2 ring-purple-400/20' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-900">Vendor Role</span>
                      {currentRole === 'vendor' && <span className="text-[10px] bg-purple-200 text-purple-800 font-bold px-1.5 py-0.5 rounded">Active</span>}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Uploads invoices, views own status, corrects discrepancy lines, and triggers approval workflow.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRoleQuickSwitch('vendor', 'vendor')}
                    className="mt-3 w-full py-1.5 px-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Enter as Vendor (Rajesh)</span>
                  </button>
                </div>

                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${currentRole === 'manager' ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-400/20' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900">Manager Role</span>
                      {currentRole === 'manager' && <span className="text-[10px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded">Active</span>}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Reviews assigned team resources, signs off on matches, approves exceptions, or rejects invalid lines.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRoleQuickSwitch('manager', 'manager')}
                    className="mt-3 w-full py-1.5 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Enter as Manager (Sarah)</span>
                  </button>
                </div>

                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${currentRole === 'admin' || currentRole === 'finance' ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900">Administrator Role</span>
                      {(currentRole === 'admin' || currentRole === 'finance') && <span className="text-[10px] bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded">Active</span>}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Full corporate oversight: Timesheet master DB management, global mismatch analytics, and clearance release.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRoleQuickSwitch('finance', 'finance')}
                    className="mt-3 w-full py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Enter as Finance (Michael)</span>
                  </button>
                </div>
              </div>

              {/* Matrix Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-4">System Permission / Capability</th>
                      <th className="py-2.5 px-3 text-center w-24">Vendor</th>
                      <th className="py-2.5 px-3 text-center w-24">Manager</th>
                      <th className="py-2.5 px-3 text-center w-24">Administrator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {permissionsMatrix.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-4">
                          <div className="font-semibold text-slate-800">{item.capability}</div>
                          <div className="text-[10px] text-slate-400">{item.note}</div>
                        </td>
                        
                        <td className="py-2 px-3 text-center">
                          {item.vendor ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                              <Check className="w-3 h-3" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-slate-100 text-slate-400 rounded-full">
                              <Minus className="w-3 h-3" />
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-center">
                          {item.manager ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                              <Check className="w-3 h-3" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-slate-100 text-slate-400 rounded-full">
                              <Minus className="w-3 h-3" />
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-center">
                          {item.admin ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                              <Check className="w-3 h-3" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-slate-100 text-slate-400 rounded-full">
                              <Minus className="w-3 h-3" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Process Header */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-blue-900">
                  How the System Operates When a Manager Rejects an Invoice Data Line
                </h3>
                <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                  The approval flow covers <strong>all resource lines</strong> (both exact matches and discrepancies). Vendors are expected to align discrepancies before submission. When a manager rejects an invalid line, a secure, closed-loop revision cycle is automatically executed:
                </p>
              </div>

              {/* Step by Step Flowchart */}
              <div className="space-y-4 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
                
                {/* Step 1 */}
                <div className="flex gap-4 relative">
                  <div className="w-12 h-12 bg-red-100 border-2 border-red-500 rounded-xl flex items-center justify-center text-red-600 shrink-0 font-bold z-10 shadow-xs">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex-1 space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Step 1: Resource Manager Rejects Line Item</span>
                      <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full border border-red-200">REJECT_BILLING</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Manager reviews the discrepancy (e.g. 22 claimed days vs 18 approved timesheet days) and clicks <strong>"Reject Line"</strong>. A mandatory rejection rationale must be entered (e.g. <em>"Contractor took 3 days unapproved leave. Overtime not authorized. Maximum billable is 18 days."</em>).
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4 relative">
                  <div className="w-12 h-12 bg-amber-100 border-2 border-amber-500 rounded-xl flex items-center justify-center text-amber-600 shrink-0 font-bold z-10 shadow-xs">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex-1 space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Step 2: Clearance Certificate Halted & Status Locked</span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">REVISION_REQUIRED</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      The batch status transitions to <code className="text-red-700 bg-red-50 px-1 py-0.5 rounded font-mono text-[11px]">REJECTED_NEEDS_REVISION</code>. The SAP Ariba Clearance Certificate is <strong>strictly locked and blocked</strong> from issuance until every rejected line is revised and resolved.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4 relative">
                  <div className="w-12 h-12 bg-blue-100 border-2 border-blue-500 rounded-xl flex items-center justify-center text-blue-600 shrink-0 font-bold z-10 shadow-xs">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex-1 space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Step 3: Automated Dispatch Alert to Vendor</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full border border-blue-200">SMTP Notification</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      The system immediately dispatches an automated notification email to the vendor contact (<code className="text-slate-800 font-mono text-[11px]">billing@apex-tech.com</code>) specifying the rejected resource name, PO number, manager comments, and instructions to correct the line in the portal.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4 relative">
                  <div className="w-12 h-12 bg-purple-100 border-2 border-purple-500 rounded-xl flex items-center justify-center text-purple-600 shrink-0 font-bold z-10 shadow-xs">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex-1 space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Step 4: Vendor Corrects Line & Resubmits</span>
                      <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200">Vendor Revision</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      In the Vendor Portal, the rejected line is flagged in red with the manager's comment. The vendor clicks <strong>"Correct & Resubmit"</strong> to align the billed days/rates to the approved timesheet (e.g. adjusting from 22.0 to 18.0 days). The line status updates to <code className="text-purple-700 bg-purple-50 px-1 py-0.5 rounded font-mono text-[11px]">RESUBMITTED_FOR_REVIEW</code>.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex gap-4 relative">
                  <div className="w-12 h-12 bg-emerald-100 border-2 border-emerald-500 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 font-bold z-10 shadow-xs">
                    <FileCheck2 className="w-6 h-6" />
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex-1 space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Step 5: Manager Re-Approval & Clearance Unlocked</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">CLEARED_FOR_ARIBA</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      The manager reviews the corrected submission and approves it. Once all line items across the entire purchase order are 100% approved, the system generates the official <strong>SAP Ariba Pre-Invoice Clearance Certificate</strong> with verification hash and Ariba submission token.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Lock className="w-4 h-4 text-slate-400" />
            <span>Click outside or press ESC to dismiss guide</span>
          </div>
          <button
            id="rbac-close-guide-btn"
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs transition-colors cursor-pointer"
          >
            Close & Return to App
          </button>
        </div>

      </div>
    </div>
  );
};
