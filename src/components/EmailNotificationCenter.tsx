import React, { useState } from 'react';
import { 
  Mail, 
  CheckCircle2, 
  Inbox,
  ArrowRight,
  Clock,
  Send,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  FileText,
  BellRing,
  AlertTriangle,
  Users,
  ShieldCheck,
  UserCheck,
  Award,
  FileCheck,
  Download
} from 'lucide-react';
import { EmailNotification, Currency } from '../types';
import { formatCurrency } from '../utils/reconciliationEngine';

interface EmailNotificationCenterProps {
  notifications: EmailNotification[];
  currentCurrency: Currency;
  onNavigateToManager: (managerEmail: string) => void;
  onMarkAsRead: (id: string) => void;
  onOpenSendReminder?: () => void;
  onNavigateToVendor?: () => void;
  onNavigateToFinance?: () => void;
  onOpenClearanceCertificate?: (batchId: string) => void;
  onOpenPdfReport?: (batchId: string) => void;
  onTriggerDailyReminders?: () => void;
}

export const EmailNotificationCenter: React.FC<EmailNotificationCenterProps> = ({
  notifications,
  currentCurrency,
  onNavigateToManager,
  onMarkAsRead,
  onOpenSendReminder,
  onNavigateToVendor,
  onNavigateToFinance,
  onOpenClearanceCertificate,
  onOpenPdfReport,
  onTriggerDailyReminders
}) => {
  const [filter, setFilter] = useState<'ALL' | 'APPROVALS' | 'CLEARANCE' | 'REMINDERS'>('ALL');
  const [selectedEmail, setSelectedEmail] = useState<EmailNotification | null>(
    notifications.length > 0 ? notifications[0] : null
  );
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const remindersCount = notifications.filter(n => n.isReminder).length;
  const clearanceCount = notifications.filter(n => n.isClearanceNotification).length;
  const approvalsCount = notifications.filter(n => !n.isReminder && !n.isClearanceNotification).length;

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'APPROVALS') return !n.isReminder && !n.isClearanceNotification;
    if (filter === 'CLEARANCE') return !!n.isClearanceNotification;
    if (filter === 'REMINDERS') return !!n.isReminder;
    return true;
  });

  const getToolUrl = (email: EmailNotification) => {
    if (email.directToolUrl) return email.directToolUrl;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-app.internal';
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    return `${origin}${path}?role=manager&manager=${encodeURIComponent(email.toEmail)}&batch=${email.batchId}&po=${encodeURIComponent(email.poNumber)}`;
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full font-bold border border-blue-100 uppercase">
                Automated Dispatch Center
              </span>
              <span className="text-xs text-slate-500 font-mono">
                SMTP / Internal Relay Simulator
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-1">
              Automated Manager Email Notifications
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Whenever a vendor initiates an approval flow or an invoice discrepancy is detected, the system immediately dispatches automated email alerts to the responsible AB Company resource managers with secure deep-links.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onTriggerDailyReminders && (
              <button
                onClick={onTriggerDailyReminders}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
                id="dispatch-daily-reminders-btn"
                title="Dispatch automated daily reminder digest to all resource managers who have pending consultant timesheet items"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Daily Manager Reminders</span>
              </button>
            )}

            {onOpenSendReminder && (
              <button
                onClick={onOpenSendReminder}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
                id="dispatch-reminder-btn"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Send Reminder</span>
              </button>
            )}

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 shadow-2xs">
              <Inbox className="w-3.5 h-3.5 text-slate-400" />
              <span>{notifications.length} Emails Sent</span>
            </span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Email List on Left, Email Reader on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Email Log Items */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Dispatched Alerts</h3>
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  filter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('APPROVALS')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  filter === 'APPROVALS'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Approvals ({approvalsCount})
              </button>
              <button
                onClick={() => setFilter('CLEARANCE')}
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                  filter === 'CLEARANCE'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Cleared PICC ({clearanceCount})</span>
              </button>
              <button
                onClick={() => setFilter('REMINDERS')}
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                  filter === 'REMINDERS'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-700 hover:bg-blue-50'
                }`}
              >
                <BellRing className="w-2.5 h-2.5" />
                <span>Reminders ({remindersCount})</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {filter === 'REMINDERS' 
                  ? 'No reminder nudges sent yet. Click "Send Reminder" to nudge managers, vendors, or all stakeholders.'
                  : filter === 'CLEARANCE'
                  ? 'No batches have completed clearance yet. Once a manager signs off or all line items are approved, automated PICC certificates will be dispatched here.'
                  : 'No email notifications dispatched yet.'}
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isSelected = selectedEmail?.id === notif.id;
                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      setSelectedEmail(notif);
                      onMarkAsRead(notif.id);
                    }}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-blue-50/60 border-l-4 border-blue-600' 
                        : 'hover:bg-slate-50/80 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        {notif.isClearanceNotification ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                            <span>PICC CLEARED</span>
                          </span>
                        ) : notif.isReminder ? (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                            notif.urgency === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800'
                              : notif.urgency === 'URGENT'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            <BellRing className="w-2.5 h-2.5" />
                            <span>{notif.urgency || 'REMINDER'}</span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800">
                            APPROVAL
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-900 truncate max-w-[140px]">
                          To: {notif.toName}
                        </span>
                      </div>

                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(notif.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-800 line-clamp-1 mb-1">
                      {notif.subject}
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {notif.isReminder && notif.reminderMessage 
                        ? notif.reminderMessage 
                        : notif.previewText}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/60 text-[10px]">
                      <span className="font-mono text-slate-400">{notif.poNumber}</span>
                      {notif.isReminder ? (
                        <span className="font-semibold text-slate-600 flex items-center gap-1">
                          <span>From: {notif.senderRole ? notif.senderRole.toUpperCase() : (notif.fromName || 'System')}</span>
                        </span>
                      ) : (
                        <span className="font-bold text-red-600">
                          {notif.discrepanciesCount} Discrepancies ({formatCurrency(notif.financialImpact, notif.currency)})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Full Email Reader */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {selectedEmail ? (
            <div className="flex flex-col h-full">
              
              {/* Email Client Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 leading-snug">
                      {selectedEmail.subject}
                    </h2>
                    <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                      <div>
                        <span className="text-slate-400">From: </span>
                        <span className="font-medium text-slate-800">{selectedEmail.fromEmail}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">To: </span>
                        <span className="font-medium text-slate-800">{selectedEmail.toName} &lt;{selectedEmail.toEmail}&gt;</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Date: </span>
                        <span className="text-slate-700">{new Date(selectedEmail.sentAt).toUTCString()}</span>
                      </div>
                    </div>
                  </div>

                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] rounded-full font-bold border border-emerald-100 uppercase flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Delivered</span>
                  </span>
                </div>

                {/* Direct Action Link Banner */}
                {selectedEmail.isClearanceNotification ? (
                  <div className="pt-3 border-t border-slate-200">
                    <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Award className="w-4 h-4 text-emerald-200" />
                          <span>Pre-Invoice Clearance Certificate (PICC) Ready for SAP Ariba</span>
                        </div>
                        <p className="text-[11px] text-emerald-100 mt-0.5">
                          100% managerial sign-off achieved. Pre-invoice clearance code generated for touchless Ariba 3-way matching.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onOpenClearanceCertificate && (
                          <button
                            id="view-clearance-cert-btn"
                            onClick={() => onOpenClearanceCertificate(selectedEmail.batchId)}
                            className="bg-white hover:bg-emerald-50 text-emerald-800 font-bold px-3.5 py-1.5 rounded-lg text-xs shadow-sm transition-all inline-flex items-center gap-1.5"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>View PICC Certificate</span>
                          </button>
                        )}

                        {onOpenPdfReport && (
                          <button
                            id="export-clearance-pdf-btn"
                            onClick={() => onOpenPdfReport(selectedEmail.batchId)}
                            className="bg-emerald-800/80 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs border border-emerald-500/40 transition-all inline-flex items-center gap-1.5"
                            title="Download PDF Audit Report"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-200" />
                            <span>PDF Audit</span>
                          </button>
                        )}

                        {selectedEmail.actionRequiredLink === 'vendor' && onNavigateToVendor && (
                          <button
                            onClick={onNavigateToVendor}
                            className="bg-emerald-800/80 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs border border-emerald-500/40 transition-all inline-flex items-center gap-1.5"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>Vendor Portal</span>
                          </button>
                        )}

                        {selectedEmail.actionRequiredLink === 'finance' && onNavigateToFinance && (
                          <button
                            onClick={onNavigateToFinance}
                            className="bg-emerald-800/80 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs border border-emerald-500/40 transition-all inline-flex items-center gap-1.5"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>Finance Desk</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Copyable SAP Ariba Submission Code & Verification Hash */}
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center justify-between gap-2 bg-emerald-50/70 p-2 rounded-lg border border-emerald-200">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider shrink-0">
                            Ariba Token:
                          </span>
                          <span className="font-mono font-bold text-emerald-900 text-xs truncate select-all">
                            {selectedEmail.aribaSubmissionCode || 'ARIBA-PICC-CLEARED'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyLink(selectedEmail.aribaSubmissionCode || '')}
                          className="p-1 px-2 bg-white hover:bg-emerald-100 text-emerald-800 rounded text-[11px] font-medium border border-emerald-200 inline-flex items-center gap-1 shrink-0 transition-colors"
                          title="Copy SAP Ariba submission code"
                        >
                          {copiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-emerald-600" />}
                          <span>Copy</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-slate-100/80 p-2 rounded-lg border border-slate-200">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
                            Certificate ID:
                          </span>
                          <span className="font-mono text-slate-800 text-xs truncate select-all">
                            {selectedEmail.clearanceCertificateId || 'AB-PICC-2026'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyLink(selectedEmail.clearanceCertificateId || '')}
                          className="p-1 px-2 bg-white hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium border border-slate-200 inline-flex items-center gap-1 shrink-0 transition-colors"
                          title="Copy PICC certificate ID"
                        >
                          {copiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-slate-200">
                    <div className="bg-blue-600 text-white p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Direct Link to Manager Review Desk</span>
                        </div>
                        <p className="text-[11px] text-blue-100 mt-0.5">
                          Authorize consultant variances and sign-off on timesheet reconciliations directly in the tool.
                        </p>
                      </div>

                      <button
                        id="email-review-link-btn"
                        onClick={() => onNavigateToManager(selectedEmail.toEmail)}
                        className="bg-white hover:bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg text-xs shadow-sm transition-all inline-flex items-center gap-1.5 shrink-0"
                      >
                        <span>Open Review Desk</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Copyable Direct Link URL */}
                    <div className="mt-2.5 flex items-center gap-2 bg-slate-100/80 p-2 rounded-lg border border-slate-200 text-xs">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
                        Tool Link:
                      </span>
                      <span className="font-mono text-[11px] text-slate-700 truncate select-all flex-1">
                        {getToolUrl(selectedEmail)}
                      </span>
                      <button
                        id="copy-tool-link-btn"
                        onClick={() => handleCopyLink(getToolUrl(selectedEmail))}
                        className="p-1 px-2 bg-white hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium border border-slate-200 inline-flex items-center gap-1 shrink-0 transition-colors"
                        title="Copy link to clipboard"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-500" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Email Body Template */}
              {selectedEmail.isClearanceNotification ? (
                <div className="p-6 text-xs text-slate-700 space-y-5 flex-1 overflow-y-auto max-h-[580px]">
                  {/* Clearance Status Hero Banner */}
                  <div className="p-4 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 text-emerald-950 flex items-start gap-3 shadow-2xs">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Award className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm uppercase tracking-wider text-emerald-900">
                          PICC CERTIFICATE ISSUED • CLEARED FOR SAP ARIBA
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono font-bold border border-emerald-200">
                          {selectedEmail.clearanceCertificateId || 'AB-PICC-2026'}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 leading-relaxed mt-1">
                        {selectedEmail.actionRequiredLink === 'vendor'
                          ? 'Your timesheet billing reconciliation has reached 100% sign-off. You are formally authorized to submit your tax invoice in the SAP Ariba Network.'
                          : 'Vendor timesheet billing batch has completed all manager approvals. Pre-invoice clearance code is generated for touchless 3-way invoice ingestion.'}
                      </p>
                    </div>
                  </div>

                  {/* Email Salutation */}
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">Dear {selectedEmail.toName},</p>
                    <p className="text-slate-600 leading-relaxed">
                      {selectedEmail.contentBody ? (
                        <span className="whitespace-pre-line">{selectedEmail.contentBody}</span>
                      ) : (
                        <>
                          The automated pre-invoice reconciliation workflow for Purchase Order <strong className="text-slate-900 font-mono">{selectedEmail.poNumber}</strong> (Period: <strong>{selectedEmail.billingMonth || '2026-08'}</strong>) from vendor <strong className="text-slate-900">{selectedEmail.vendorName || 'Apex Global Solutions'}</strong> has achieved full sign-off.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Financial & Clearance Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Cleared Amount</span>
                      <span className="text-base font-bold text-emerald-900 font-mono block mt-0.5">
                        {formatCurrency(selectedEmail.totalClearedAmount || 0, selectedEmail.currency)}
                      </span>
                      <span className="text-[10px] text-emerald-600">Authorized for payment</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Approved Days</span>
                      <span className="text-base font-bold text-slate-800 font-mono block mt-0.5">
                        {selectedEmail.totalClearedDays ?? selectedEmail.totalBilledDays ?? 0} d
                      </span>
                      <span className="text-[10px] text-slate-500">Verified consultant days</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reconciled Lines</span>
                      <span className="text-base font-bold text-slate-800 block mt-0.5">
                        {selectedEmail.matchedCount || 1} / {selectedEmail.matchedCount || 1}
                      </span>
                      <span className="text-[10px] text-slate-500">100% sign-off rate</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Clearance Status</span>
                      <span className="text-xs font-bold text-emerald-700 block mt-1 uppercase tracking-wide">
                        {selectedEmail.clearedStatus === 'CLEARED_WITH_APPROVED_EXCEPTIONS' 
                          ? 'Approved Exceptions' 
                          : 'Exact 100% Match'}
                      </span>
                      <span className="text-[10px] text-slate-500">No open blockers</span>
                    </div>
                  </div>

                  {/* Verification Token & Cryptographic Hash Details */}
                  <div className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                          SAP Ariba Clearance Credentials & Audit Hash
                        </span>
                      </div>
                      <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800 font-mono">
                        AUTHENTICATED
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">SAP Ariba Clearance Code</span>
                        <span className="font-mono font-bold text-emerald-300 text-sm block mt-0.5 select-all">
                          {selectedEmail.aribaSubmissionCode || 'ARIBA-PICC-2026-CLEARED'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Enter this code in your SAP Ariba Network invoice header
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Authorized Sign-off</span>
                        <span className="font-semibold text-slate-200 block mt-0.5">
                          {selectedEmail.senderName || 'Resource Management Desk'}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 block truncate">
                          {selectedEmail.senderEmail || 'manager@abcompany.com'}
                        </span>
                      </div>
                    </div>

                    {selectedEmail.verificationAuditHash && (
                      <div className="pt-2 border-t border-slate-800 text-[10px]">
                        <span className="text-slate-400 uppercase font-bold tracking-wider block">Cryptographic SHA-256 Audit Hash:</span>
                        <span className="font-mono text-slate-300 break-all select-all block mt-0.5 bg-slate-950/60 p-2 rounded border border-slate-800">
                          {selectedEmail.verificationAuditHash}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Next Steps Guidance Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                    <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mandatory Process Workflow Following Pre-Invoice Clearance</span>
                    </div>
                    <ol className="space-y-2 text-slate-600 text-[11px] list-decimal list-inside">
                      <li>
                        <strong className="text-slate-800">SAP Ariba Network Invoicing:</strong> Vendor submits the final commercial invoice referencing clearance token <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-slate-800">{selectedEmail.aribaSubmissionCode || 'PICC-CODE'}</code>.
                      </li>
                      <li>
                        <strong className="text-slate-800">Zero-Touch 3-Way Matching:</strong> AB Company's ERP (SAP S/4HANA & Ariba) matches the line amounts against this cleared certificate, bypassing manual AP routing.
                      </li>
                      <li>
                        <strong className="text-slate-800">Disbursement:</strong> Cleared batches enter automated payment scheduling per standard vendor payment terms.
                      </li>
                    </ol>
                  </div>

                  {/* Action Footer */}
                  <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-slate-500 italic text-[11px]">
                        Best regards,<br />
                        AB Company Accounts Payable & Invoicing Automation Service<br />
                        Corporate Procurement Governance Desk
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {onOpenClearanceCertificate && (
                        <button
                          onClick={() => onOpenClearanceCertificate(selectedEmail.batchId)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs shadow-xs transition-colors inline-flex items-center gap-1.5"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Open Certificate (PICC)</span>
                        </button>
                      )}

                      {onOpenPdfReport && (
                        <button
                          onClick={() => onOpenPdfReport(selectedEmail.batchId)}
                          className="bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-2 rounded-lg text-xs border border-slate-300 transition-colors inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          <span>Audit PDF</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : selectedEmail.isReminder ? (
                <div className="p-6 text-xs text-slate-700 space-y-5 flex-1 overflow-y-auto max-h-[580px]">
                  
                  {/* Reminder Priority Banner */}
                  <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                    selectedEmail.urgency === 'CRITICAL'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : selectedEmail.urgency === 'URGENT'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-blue-50 border-blue-200 text-blue-900'
                  }`}>
                    {selectedEmail.urgency === 'CRITICAL' ? (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <BellRing className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm uppercase tracking-wider">
                          {selectedEmail.urgency || 'PRIORITY'} STAKEHOLDER NUDGE
                        </span>
                        {selectedEmail.senderRole && (
                          <span className="px-2 py-0.5 bg-white/80 rounded text-[10px] font-bold border border-slate-300 uppercase">
                            FROM: {selectedEmail.senderRole}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        This communication was dispatched directly by a verified stakeholder to accelerate timesheet reconciliation and clearance before the ERP cutoff.
                      </p>
                    </div>
                  </div>

                  {/* Reminder Metadata Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sender</span>
                      <span className="text-xs font-bold text-slate-800 block mt-0.5 truncate">
                        {selectedEmail.fromName || selectedEmail.fromEmail}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">{selectedEmail.fromEmail}</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recipient</span>
                      <span className="text-xs font-bold text-slate-800 block mt-0.5 truncate">
                        {selectedEmail.toName}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">{selectedEmail.toEmail}</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Purchase Order</span>
                      <span className="text-xs font-bold font-mono text-slate-800 block mt-0.5">
                        {selectedEmail.poNumber}
                      </span>
                      <span className="text-[10px] text-slate-500 block">Period: {selectedEmail.billingMonth || '2026-08'}</span>
                    </div>
                  </div>

                  {/* Message Content Box */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Message Body
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-line font-sans bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                      {selectedEmail.reminderMessage || selectedEmail.previewText}
                    </div>
                  </div>

                  {/* Navigation Call-to-Action Buttons */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">Required Action</span>
                      <span className="text-[11px] text-slate-500">
                        {selectedEmail.senderRole === 'vendor' 
                          ? 'Review pending consultant timesheet variances in your queue.'
                          : 'Review rejected lines or confirm timesheet records in the portal.'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onNavigateToManager(selectedEmail.toEmail)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs shadow-xs transition-colors inline-flex items-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Open Manager Review Desk</span>
                      </button>

                      {onNavigateToVendor && (
                        <button
                          onClick={onNavigateToVendor}
                          className="bg-white hover:bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs border border-slate-300 transition-colors inline-flex items-center gap-1.5"
                        >
                          <Building2 className="w-3.5 h-3.5 text-purple-600" />
                          <span>Open Vendor Portal</span>
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
              <div className="p-6 text-xs text-slate-700 space-y-5 flex-1 overflow-y-auto max-h-[580px]">
                <div className="border-l-4 border-blue-600 pl-3 py-1 bg-blue-50/40 rounded-r-lg">
                  <p className="font-bold text-slate-900">
                    Automated Alert: Action Required for AB Company Timesheet Reconciliation
                  </p>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    Vendor <strong className="text-slate-800">{selectedEmail.vendorName || 'Apex Global Solutions'}</strong> has initiated an approval workflow requiring your review as Resource Manager.
                  </p>
                </div>

                {/* Email Greeting */}
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800">Dear {selectedEmail.toName},</p>
                  <p className="text-slate-600 leading-relaxed">
                    The AB Company Automated Invoicing Engine has processed the monthly consultant timesheet upload for 
                    Purchase Order <span className="font-mono font-bold text-slate-900">{selectedEmail.poNumber}</span> (Billing Period: <strong>{selectedEmail.billingMonth || '2026-08'}</strong>). 
                    Below is the executive summary of data requiring your direct authorization before an SAP Ariba pre-invoice clearance can be generated.
                  </p>
                </div>

                {/* KPI Summary Cards inside Email */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vendor</span>
                    <span className="text-xs font-bold text-slate-800 truncate block mt-0.5">
                      {selectedEmail.vendorName || 'Apex Global Solutions'}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billing Period</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5">
                      {selectedEmail.billingMonth || 'August 2026'}
                    </span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Discrepancies</span>
                    <span className="text-sm font-bold text-amber-900 block mt-0.5">
                      {selectedEmail.discrepanciesCount} Flagged Items
                    </span>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">Variance Exposure</span>
                    <span className="text-sm font-bold text-red-900 block mt-0.5">
                      {formatCurrency(selectedEmail.financialImpact, selectedEmail.currency)}
                    </span>
                  </div>
                </div>

                {/* Structured Data Requiring Approval Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Summary of Data Requiring Manager Approval
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 font-medium">
                      PO: {selectedEmail.poNumber}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Resource</th>
                          <th className="py-2.5 px-3">AB Approved</th>
                          <th className="py-2.5 px-3">Vendor Claim</th>
                          <th className="py-2.5 px-3">Variance Days</th>
                          <th className="py-2.5 px-3">Rate</th>
                          <th className="py-2.5 px-3 text-right">Financial Variance</th>
                          <th className="py-2.5 px-3">Status / Flag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedEmail.itemsSummary && selectedEmail.itemsSummary.length > 0 ? (
                          selectedEmail.itemsSummary.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">{item.resourceName}</div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">{item.resourceEmail}</div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">
                                {item.internalApprovedDays} d
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {item.billedDays} d
                              </td>
                              <td className="py-2.5 px-3 font-semibold">
                                {item.daysVariance > 0 ? (
                                  <span className="text-red-600">+{item.daysVariance} d</span>
                                ) : item.daysVariance < 0 ? (
                                  <span className="text-blue-600">{item.daysVariance} d</span>
                                ) : (
                                  <span className="text-emerald-600">0 d (Match)</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600">
                                {formatCurrency(item.contractDailyRate, selectedEmail.currency)}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-right">
                                {item.financialVarianceAmount > 0 ? (
                                  <span className="text-red-600">+{formatCurrency(item.financialVarianceAmount, selectedEmail.currency)}</span>
                                ) : (
                                  <span className="text-slate-400">$0.00</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                  item.discrepancyType === 'PERFECT_MATCH'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.discrepancyType === 'DAYS_OVERBILLED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {item.discrepancyType.replace(/_/g, ' ')}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          // Fallback default demonstration summary when itemsSummary wasn't provided
                          <>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">Priya Nair</div>
                                <div className="text-[10px] text-slate-400 font-mono">priya.nair@apexconsulting.com</div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">18 d</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">22 d</td>
                              <td className="py-2.5 px-3 font-semibold text-red-600">+4 d</td>
                              <td className="py-2.5 px-3 font-mono text-slate-600">{formatCurrency(920, selectedEmail.currency)}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-red-600 text-right">+{formatCurrency(3680, selectedEmail.currency)}</td>
                              <td className="py-2.5 px-3">
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-red-100 text-red-800">
                                  DAYS OVERBILLED
                                </span>
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">Lucas Silva</div>
                                <div className="text-[10px] text-slate-400 font-mono">lucas.silva@apexconsulting.com</div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">15 d</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">15 d</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-500">0 d</td>
                              <td className="py-2.5 px-3 font-mono text-slate-600">{formatCurrency(800, selectedEmail.currency)}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-amber-600 text-right">+{formatCurrency(1500, selectedEmail.currency)}</td>
                              <td className="py-2.5 px-3">
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                                  RATE MISMATCH
                                </span>
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">Darren Hayes</div>
                                <div className="text-[10px] text-slate-400 font-mono">darren.hayes@contractor.com</div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">0 d</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">12 d</td>
                              <td className="py-2.5 px-3 font-semibold text-red-600">+12 d</td>
                              <td className="py-2.5 px-3 font-mono text-slate-600">{formatCurrency(850, selectedEmail.currency)}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-red-600 text-right">+{formatCurrency(10200, selectedEmail.currency)}</td>
                              <td className="py-2.5 px-3">
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-red-100 text-red-800">
                                  UNMAPPED CONSULTANT
                                </span>
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Manager Action Options Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>Authorized Review Actions in Tool</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-600 text-[11px] list-disc list-inside">
                    <li>
                      <strong className="text-slate-800">Approve Variance:</strong> Authorize offline overtime or sprint milestones with mandatory business justification notes.
                    </li>
                    <li>
                      <strong className="text-slate-800">Adjust to Internal Timesheet:</strong> Cap the billing at the internal approved timesheet days, generating an automatic credit.
                    </li>
                    <li>
                      <strong className="text-slate-800">Reject Line Item:</strong> Send the item back to the vendor with reason notes, preventing invoice clearance until a corrected file is submitted.
                    </li>
                  </ul>
                </div>

                {/* Footer with Direct CTA */}
                <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-slate-500 italic text-[11px]">
                      Best regards,<br />
                      AB Company Accounts Payable & Invoicing Automation Service<br />
                      Corporate Procurement Governance Desk
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigateToManager(selectedEmail.toEmail)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs shadow-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>Authorize as {selectedEmail.toName}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              )}

            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center h-full">
              <Mail className="w-10 h-10 text-slate-300 mb-2" />
              <span>Select an email from the left pane to view the full notification payload.</span>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
