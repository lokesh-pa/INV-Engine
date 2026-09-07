import React, { useState, useEffect } from 'react';
import { 
  BellRing, 
  Send, 
  Users, 
  UserCheck, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  X, 
  Building2, 
  AlertTriangle,
  FileText,
  Mail
} from 'lucide-react';
import { UserProfile, Role, InvoiceBatch, DiscrepancyItem, ReminderPayload } from '../types';
import { SAMPLE_USERS } from '../data/mockCentralDb';

export type { ReminderPayload };

interface SendReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  batches: InvoiceBatch[];
  onSendReminder: (payload: ReminderPayload) => void;
  initialTargetAudience?: 'EVERYONE' | 'ALL_MANAGERS' | 'ALL_VENDORS' | 'SPECIFIC_MANAGER' | 'SPECIFIC_VENDOR';
  initialPoNumber?: string;
  initialBatchId?: string;
  initialRecipientEmail?: string;
  initialItem?: DiscrepancyItem;
}

export const SendReminderModal: React.FC<SendReminderModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  batches,
  onSendReminder,
  initialTargetAudience,
  initialPoNumber,
  initialBatchId,
  initialRecipientEmail,
  initialItem
}) => {
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'finance';
  const isVendor = currentUser.role === 'vendor';
  const isManager = currentUser.role === 'manager';

  // Determine available audiences based on user role
  const getDefaultAudience = (): 'EVERYONE' | 'ALL_MANAGERS' | 'ALL_VENDORS' | 'SPECIFIC_MANAGER' | 'SPECIFIC_VENDOR' => {
    if (initialTargetAudience) return initialTargetAudience;
    if (isAdmin) return 'EVERYONE';
    if (isVendor) return initialRecipientEmail ? 'SPECIFIC_MANAGER' : 'ALL_MANAGERS';
    if (isManager) return 'SPECIFIC_VENDOR';
    return 'EVERYONE';
  };

  const [targetAudience, setTargetAudience] = useState<'EVERYONE' | 'ALL_MANAGERS' | 'ALL_VENDORS' | 'SPECIFIC_MANAGER' | 'SPECIFIC_VENDOR'>(getDefaultAudience());
  const [selectedPo, setSelectedPo] = useState<string>(initialPoNumber || batches[0]?.poNumber || 'PO-AB-2026-8941');
  const [selectedBatchId, setSelectedBatchId] = useState<string>(initialBatchId || batches[0]?.id || '');
  const [specificEmail, setSpecificEmail] = useState<string>(initialRecipientEmail || '');
  const [urgency, setUrgency] = useState<'NORMAL' | 'URGENT' | 'CRITICAL'>('URGENT');
  const [subject, setSubject] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isSent, setIsSent] = useState<boolean>(false);

  // Managers list
  const managers = SAMPLE_USERS.filter(u => u.role === 'manager');
  const vendors = SAMPLE_USERS.filter(u => u.role === 'vendor');

  // Set default specific recipient if needed
  useEffect(() => {
    if (initialRecipientEmail) {
      setSpecificEmail(initialRecipientEmail);
    } else if (targetAudience === 'SPECIFIC_MANAGER' && !specificEmail) {
      setSpecificEmail(managers[0]?.email || 'sarah.jenkins@abcompany.com');
    } else if (targetAudience === 'SPECIFIC_VENDOR' && !specificEmail) {
      setSpecificEmail(vendors[0]?.email || 'billing@apex-tech.com');
    }
  }, [targetAudience, initialRecipientEmail, specificEmail, managers, vendors]);

  // Dynamic template presets based on sender role and target
  const getPresets = () => {
    if (isAdmin) {
      return [
        {
          label: 'Cycle Cutoff (All Stakeholders)',
          subject: 'CRITICAL: AP Month-End Close - Outstanding Timesheet & Invoice Clearances Due by Friday',
          message: 'Corporate Accounts Payable notice: The ERP billing clearance cycle locks this Friday at 5:00 PM EST. All resource managers must finalize pending timesheet authorizations, and all vendors must resubmit corrected rejected lines. Invoices without approved Pre-Invoice Clearance (PICC) will defer to next billing cycle.',
          urgency: 'CRITICAL' as const
        },
        {
          label: 'SLA Escalation (Managers)',
          subject: 'SLA Alert: Pending Timesheet Approvals Exceeding 48-Hour Threshold',
          message: 'Automated Governance Nudge: You currently have consultant timesheet discrepancies awaiting authorization. Please review and sign off in the Manager Authorization Queue to prevent vendor payment delays and ensure PO compliance.',
          urgency: 'URGENT' as const
        },
        {
          label: 'Vendor Correction Nudge',
          subject: 'Notice: Resubmission Required for Rejected Invoice Lines',
          message: 'Finance AP Reminder: Resource managers have rejected one or more line items due to unapproved leaves or rate variances. Please log into the Vendor Portal, adjust claimed days, and resubmit for approval.',
          urgency: 'NORMAL' as const
        }
      ];
    }

    if (isVendor) {
      return [
        {
          label: 'Pending Discrepancy Authorization',
          subject: `Reminder: Action Required on ${selectedPo} - Consultant Timesheet Approvals Awaiting Sign-off`,
          message: `Dear Resource Manager,\n\nWe have submitted our consulting invoice reconciliation for ${selectedPo}. Several line items are currently flagged for your authorization. Kindly sign off or provide resolution so that our Pre-Invoice Clearance Certificate (PICC) can be generated before the SAP Ariba billing cycle locks.\n\nThank you,\n${currentUser.name} (Apex Accounts Receivable)`,
          urgency: 'URGENT' as const
        },
        {
          label: 'Correction Resubmitted Nudge',
          subject: `Resubmission Follow-up: Revised Line Item Ready for Review on ${selectedPo}`,
          message: `Dear Resource Manager,\n\nWe have addressed the previous feedback and resubmitted the revised billing days as requested. Please verify and confirm the authorization at your earliest convenience.\n\nBest regards,\n${currentUser.name}`,
          urgency: 'NORMAL' as const
        },
        {
          label: 'Upcoming Month-End Deadline',
          subject: `Urgent Reminder: Upcoming Billing Cutoff on Purchase Order ${selectedPo}`,
          message: `Friendly reminder that the corporate accounting window closes in 2 business days. Please finalize pending approvals for our consultants on ${selectedPo}.\n\nAppreciated,\n${currentUser.name}`,
          urgency: 'CRITICAL' as const
        }
      ];
    }

    // Manager sending to Vendor
    return [
      {
        label: 'Resubmit Rejected Lines',
        subject: `Action Required: Please Revise Rejected Consultant Line Items on ${selectedPo}`,
        message: `Hello Vendor Accounts Receivable,\n\nWe reviewed your billing submission for ${selectedPo}. One or more consultant lines have been rejected due to variance against internal verified timesheets. Please review the rejection rationales, cap your billed days to the approved count, and resubmit via the Vendor Portal.\n\nThank you,\n${currentUser.name}`,
        urgency: 'URGENT' as const
      },
      {
        label: 'Overtime Sign-off Documentation Request',
        subject: `Documentation Needed: Please Attach Signed SOW Addendum for Claimed Overtime on ${selectedPo}`,
        message: `Hello,\n\nWe noticed claimed days exceeding planned baseline. Please supply the client project lead approval email or SOW addendum so we can authorize the financial variance in our queue.\n\nRegards,\n${currentUser.name}`,
        urgency: 'NORMAL' as const
      },
      {
        label: 'Final Cutoff Warning',
        subject: `FINAL CALL: Uncorrected Invoices for ${selectedPo} Will Be Excluded From Month-End Batch`,
        message: `Please be advised that if corrected lines are not received by tomorrow at 4:00 PM EST, your invoice will be held until the following billing period.\n\nSincerely,\n${currentUser.name}`,
        urgency: 'CRITICAL' as const
      }
    ];
  };

  const presets = getPresets();

  // Apply a preset
  const handleApplyPreset = (p: typeof presets[0]) => {
    setSubject(p.subject);
    setMessage(p.message);
    setUrgency(p.urgency);
  };

  // Initial populate if empty
  useEffect(() => {
    if (!subject && presets.length > 0) {
      setSubject(presets[0].subject);
      setMessage(presets[0].message);
      setUrgency(presets[0].urgency);
    }
  }, [presets, subject]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let recipientEmails: string[] = [];
    let recipientNames: string[] = [];

    if (targetAudience === 'EVERYONE') {
      recipientEmails = SAMPLE_USERS.map(u => u.email);
      recipientNames = SAMPLE_USERS.map(u => u.name);
    } else if (targetAudience === 'ALL_MANAGERS') {
      recipientEmails = managers.map(u => u.email);
      recipientNames = managers.map(u => u.name);
    } else if (targetAudience === 'ALL_VENDORS') {
      recipientEmails = vendors.map(u => u.email);
      recipientNames = vendors.map(u => u.name);
    } else if (targetAudience === 'SPECIFIC_MANAGER' || targetAudience === 'SPECIFIC_VENDOR') {
      const foundUser = SAMPLE_USERS.find(u => u.email === specificEmail);
      recipientEmails = [specificEmail];
      recipientNames = [foundUser ? foundUser.name : specificEmail];
    }

    onSendReminder({
      targetAudience,
      recipientEmails,
      recipientNames,
      subject,
      message,
      urgency,
      poNumber: selectedPo,
      batchId: selectedBatchId
    });

    setIsSent(true);
    setTimeout(() => {
      setIsSent(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 shadow-sm">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">Dispatch Stakeholder Reminder</h3>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-[10px] font-semibold uppercase">
                  {currentUser.role.toUpperCase()} DISPATCHER
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Nudge stakeholders with prioritized notifications, email relays, and deep links
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        {isSent ? (
          <div className="p-12 text-center space-y-3 flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-slate-800">Reminder Dispatched Successfully!</h4>
            <p className="text-xs text-slate-500 max-w-md">
              Alerts have been relayed via SMTP simulator to targeted stakeholder inboxes with audit logs recorded.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs text-slate-700">
            
            {/* Sender Context Banner */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs overflow-hidden">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    currentUser.name.slice(0, 2)
                  )}
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>From: {currentUser.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({currentUser.email})</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Role: <strong className="capitalize text-slate-700">{currentUser.role}</strong>
                    {currentUser.department && ` • ${currentUser.department}`}
                    {currentUser.vendorName && ` • ${currentUser.vendorName}`}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Priority</span>
                <div className="flex items-center gap-1 mt-1">
                  {(['NORMAL', 'URGENT', 'CRITICAL'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setUrgency(p)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                        urgency === p
                          ? p === 'CRITICAL' 
                            ? 'bg-rose-100 text-rose-800 border-rose-300' 
                            : p === 'URGENT' 
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Recipient / Audience Configuration */}
            <div className="space-y-2">
              <label className="font-bold text-slate-800 text-xs block uppercase tracking-wider">
                Recipient Audience
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setTargetAudience('EVERYONE')}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                      targetAudience === 'EVERYONE'
                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>Everyone (All)</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">
                      System-wide broadcast to all managers & vendors
                    </span>
                  </button>
                )}

                {(isAdmin || isVendor) && (
                  <button
                    type="button"
                    onClick={() => setTargetAudience(isVendor ? 'ALL_MANAGERS' : 'ALL_MANAGERS')}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                      targetAudience === 'ALL_MANAGERS'
                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span>All Resource Managers</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Nudge all managers with pending approvals
                    </span>
                  </button>
                )}

                {(isAdmin || isManager) && (
                  <button
                    type="button"
                    onClick={() => setTargetAudience(isManager ? 'SPECIFIC_VENDOR' : 'ALL_VENDORS')}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                      targetAudience === 'ALL_VENDORS' || (isManager && targetAudience === 'SPECIFIC_VENDOR')
                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Building2 className="w-4 h-4 text-purple-600" />
                      <span>{isManager ? 'Vendor (Apex Billing)' : 'All Active Vendors'}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">
                      {isManager ? 'Remind vendor to revise rejected lines' : 'Nudge all service providers'}
                    </span>
                  </button>
                )}

                {/* Specific Recipient Option */}
                <button
                  type="button"
                  onClick={() => setTargetAudience(isVendor ? 'SPECIFIC_MANAGER' : (isManager ? 'SPECIFIC_VENDOR' : 'SPECIFIC_MANAGER'))}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                    targetAudience === 'SPECIFIC_MANAGER' || (targetAudience === 'SPECIFIC_VENDOR' && !isManager)
                      ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Mail className="w-4 h-4 text-amber-600" />
                    <span>Specific Contact</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Send targeted nudge to one individual
                  </span>
                </button>
              </div>

              {/* Specific Recipient Dropdown */}
              {(targetAudience === 'SPECIFIC_MANAGER' || targetAudience === 'SPECIFIC_VENDOR') && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mt-2">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Select Target Recipient
                  </label>
                  <select
                    value={specificEmail}
                    onChange={(e) => setSpecificEmail(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {targetAudience === 'SPECIFIC_MANAGER' ? (
                      managers.map(m => (
                        <option key={m.id} value={m.email}>
                          {m.name} — {m.email} ({m.department})
                        </option>
                      ))
                    ) : (
                      vendors.map(v => (
                        <option key={v.id} value={v.email}>
                          {v.name} — {v.email} ({v.vendorName})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>

            {/* Target PO Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">
                  Related Purchase Order
                </label>
                <select
                  value={selectedPo}
                  onChange={(e) => setSelectedPo(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  {batches.map(b => (
                    <option key={b.id} value={b.poNumber}>
                      {b.poNumber} — {b.vendorName} ({b.billingMonth})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">
                  1-Click Quick Template Presets
                </label>
                <div className="flex flex-wrap gap-1">
                  {presets.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition-colors border border-slate-200"
                    >
                      ⚡ {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Subject Field */}
            <div>
              <label className="font-bold text-slate-700 text-xs block mb-1">
                Email Subject Line
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. URGENT: Action Required on PO-AB-2026-8941"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Message Body */}
            <div>
              <label className="font-bold text-slate-700 text-xs block mb-1">
                Detailed Reminder Message
              </label>
              <textarea
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your custom reminder or instructions here..."
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Notice */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900 text-[11px]">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Live Notification Relay:</strong> This action dispatches real-time email alerts with deep links into the Notification Center, appears as high-priority banners in stakeholder portals, and logs directly into the corporate audit ledger.
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-xs transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch Reminder</span>
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
