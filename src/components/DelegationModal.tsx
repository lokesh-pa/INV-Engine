import React, { useState } from 'react';
import { 
  X, 
  UserCheck, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Plus, 
  ShieldCheck, 
  ArrowRight,
  UserPlus
} from 'lucide-react';
import { UserProfile, ApprovalDelegation } from '../types';
import { SAMPLE_USERS } from '../data/mockCentralDb';

interface DelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  delegations: ApprovalDelegation[];
  onSaveDelegation: (delegation: ApprovalDelegation) => void;
  onRevokeDelegation: (delegationId: string) => void;
}

export const DelegationModal: React.FC<DelegationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  delegations,
  onSaveDelegation,
  onRevokeDelegation
}) => {
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  
  // Form State
  const eligibleManagers = SAMPLE_USERS.filter(u => u.role === 'manager' && u.email !== currentUser.email);
  const [delegateeEmail, setDelegateeEmail] = useState<string>(eligibleManagers[0]?.email || '');
  const [reason, setReason] = useState<string>('Out of Office / Annual Leave - Delegating resource timesheet approvals');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [scope, setScope] = useState<'ALL_RESOURCES' | 'SPECIFIC_PO'>('ALL_RESOURCES');
  const [poNumber, setPoNumber] = useState<string>('PO-AB-2026-8941');

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const delegateeUser = SAMPLE_USERS.find(u => u.email === delegateeEmail);
    if (!delegateeUser) return;

    const newDelegation: ApprovalDelegation = {
      id: `DEL-${Date.now()}`,
      delegatorEmail: currentUser.email,
      delegatorName: currentUser.name,
      delegatorDepartment: currentUser.department,
      delegateeEmail: delegateeUser.email,
      delegateeName: delegateeUser.name,
      delegateeDepartment: delegateeUser.department,
      reason,
      startDate,
      endDate: endDate || 'INDEFINITE',
      scope,
      poNumber: scope === 'SPECIFIC_PO' ? poNumber : undefined,
      active: true,
      createdAt: new Date().toISOString()
    };

    onSaveDelegation(newDelegation);
    setShowAddForm(false);
  };

  // Delegations where current user is delegator
  const myDelegations = delegations.filter(d => d.delegatorEmail.toLowerCase() === currentUser.email.toLowerCase());
  
  // Delegations where current user is the delegatee (acting on behalf of someone)
  const actingDelegations = delegations.filter(d => d.delegateeEmail.toLowerCase() === currentUser.email.toLowerCase() && d.active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Approval Authority Delegation</h2>
              <p className="text-xs text-slate-300">
                Designate alternate authorized managers to review and sign off on consultant invoices
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Active Acting Banner if current user is delegatee */}
          {actingDelegations.length > 0 && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    You Are Acting as an Authorized Delegate
                  </h4>
                  <p className="text-xs text-emerald-800 mt-1">
                    You currently hold delegated approval authority for:
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {actingDelegations.map(del => (
                      <div key={del.id} className="flex items-center gap-2 text-xs text-emerald-900 font-medium bg-white/70 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                        <span className="font-bold">{del.delegatorName}</span>
                        <span className="text-emerald-700">({del.delegatorDepartment || 'Manager'})</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-emerald-700">Effective until {del.endDate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* User's Own Outgoing Delegations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Your Delegated Authorities</h3>
                <p className="text-xs text-slate-500">
                  Outgoing approval permissions granted to colleagues during leave or peak loads
                </p>
              </div>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Delegate Authority</span>
                </button>
              )}
            </div>

            {myDelegations.length === 0 && !showAddForm ? (
              <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-2">
                  <UserCheck className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700">No Outgoing Delegations</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  You have not delegated your timesheet and invoice approval authority. All assigned resources will route directly to your review desk.
                </p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-3 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Set Up Delegation</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myDelegations.map(del => (
                  <div 
                    key={del.id}
                    className={`p-4 rounded-xl border transition-all ${
                      del.active 
                        ? 'bg-blue-50/50 border-blue-200' 
                        : 'bg-slate-50 border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase border ${
                            del.active 
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                              : 'bg-slate-200 text-slate-700 border-slate-300'
                          }`}>
                            {del.active ? 'Active Delegation' : 'Revoked / Expired'}
                          </span>
                          <span className="text-xs font-semibold text-slate-800">
                            Delegated to {del.delegateeName}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-1.5">
                          <strong className="text-slate-700">Reason:</strong> {del.reason}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>From: <strong>{del.startDate}</strong></span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Until: <strong>{del.endDate}</strong></span>
                          </div>
                          <div className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                            <span>Scope: <strong>{del.scope === 'ALL_RESOURCES' ? 'All Resources' : `PO ${del.poNumber}`}</strong></span>
                          </div>
                        </div>
                      </div>

                      {del.active && (
                        <button
                          onClick={() => onRevokeDelegation(del.id)}
                          className="px-2.5 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 font-medium transition-colors inline-flex items-center gap-1 shrink-0"
                          title="Revoke Delegation Authority"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Delegation Form */}
          {showAddForm && (
            <form onSubmit={handleCreate} className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  New Authority Delegation Rule
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              {/* Delegatee Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Designated Delegate (Authorized Manager)
                </label>
                <select
                  value={delegateeEmail}
                  onChange={(e) => setDelegateeEmail(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
                >
                  {eligibleManagers.map(mgr => (
                    <option key={mgr.email} value={mgr.email}>
                      {mgr.name} — {mgr.department || 'Resource Manager'} ({mgr.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Reason & Audit Notes
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Out of office for Q3 architecture summit"
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                  required
                />
              </div>

              {/* Date Ranges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Approval Scope
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === 'ALL_RESOURCES'}
                      onChange={() => setScope('ALL_RESOURCES')}
                      className="text-blue-600"
                    />
                    <span>All My Assigned Resources</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === 'SPECIFIC_PO'}
                      onChange={() => setScope('SPECIFIC_PO')}
                      className="text-blue-600"
                    />
                    <span>Specific Purchase Order Only</span>
                  </label>
                </div>
                {scope === 'SPECIFIC_PO' && (
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="Enter PO Number (e.g. PO-AB-2026-8941)"
                    className="mt-2 w-full text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono"
                  />
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs"
                >
                  Confirm & Activate Delegation
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>All delegated sign-offs are tagged in the immutable SAP audit log</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium text-slate-700 transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
