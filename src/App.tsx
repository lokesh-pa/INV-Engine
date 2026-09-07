import React, { useState, useEffect } from 'react';
import { 
  Role, 
  UserProfile, 
  Currency, 
  InternalTimesheet, 
  InvoiceBatch, 
  EmailNotification, 
  AuditLogEntry,
  DiscrepancyItem,
  BatchApprovalStatus,
  ApprovalDelegation,
  BulkApprovalAction,
  EmailDiscrepancySummaryItem,
  PreInvoiceClearance
} from './types';
import { 
  SAMPLE_USERS, 
  INITIAL_CENTRAL_TIMESHEETS, 
  SAMPLE_VENDOR_INVOICE_ROWS,
  INITIAL_DELEGATIONS,
  SAMPLE_HISTORICAL_BATCHES,
  getDomainCooForManager
} from './data/mockCentralDb';
import { 
  reconcileInvoiceRows, 
  generatePreInvoiceClearance, 
  resyncBatchWithTimesheets,
  formatCurrency 
} from './utils/reconciliationEngine';
import { StorageService } from './utils/storageHelper';
import { canAccessTab, hasPermission, ROLE_CONFIGS } from './utils/rbac';
import { Header } from './components/Header';
import { VendorPortal } from './components/VendorPortal';
import { ManagerPortal } from './components/ManagerPortal';
import { FinanceDashboard } from './components/FinanceDashboard';
import { TimesheetDatabaseView } from './components/TimesheetDatabaseView';
import { EmailNotificationCenter } from './components/EmailNotificationCenter';
import { AribaClearanceModal } from './components/AribaClearanceModal';
import { AccessDenied } from './components/AccessDenied';
import { RbacPolicyModal } from './components/RbacPolicyModal';
import { SendReminderModal, ReminderPayload } from './components/SendReminderModal';
import { AuditPdfReportModal } from './components/AuditPdfReportModal';
import { AribaGrValidator } from './components/AribaGrValidator';
import { Shield, Lock, ShieldCheck, RefreshCw } from 'lucide-react';

export default function App() {
  // State
  const [currentUser, setCurrentUser] = useState<UserProfile>(SAMPLE_USERS[0]); // Default: Rajesh Sharma (Vendor)
  const [currentCurrency, setCurrentCurrency] = useState<Currency>('USD');
  const [activeTab, setActiveTab] = useState<string>('vendor');
  const [timesheets, setTimesheets] = useState<InternalTimesheet[]>(() => {
    return StorageService.getTimesheets(INITIAL_CENTRAL_TIMESHEETS);
  });
  const [showRbacModal, setShowRbacModal] = useState<boolean>(false);
  const [showReminderModal, setShowReminderModal] = useState<boolean>(false);
  const [selectedAuditPdfBatch, setSelectedAuditPdfBatch] = useState<InvoiceBatch | null>(null);
  const [resyncSuccessToast, setResyncSuccessToast] = useState<string | null>(null);
  const [reminderInitialContext, setReminderInitialContext] = useState<{
    poNumber?: string;
    batchId?: string;
    recipientEmail?: string;
    item?: DiscrepancyItem;
  } | undefined>(undefined);
  
  // Initialize batches from persistent storage or default reconciled seed
  const [batches, setBatches] = useState<InvoiceBatch[]>(() => {
    const initialRows = SAMPLE_VENDOR_INVOICE_ROWS['PO-AB-2026-8941'];
    const initialBatch = reconcileInvoiceRows(
      initialRows,
      INITIAL_CENTRAL_TIMESHEETS,
      'Apex Global Solutions',
      'billing@apex-tech.com',
      'PO-AB-2026-8941',
      '2026-08',
      'Apex_August_Consulting_Invoice.xlsx'
    );
    const defaultBatches = [initialBatch, ...SAMPLE_HISTORICAL_BATCHES];
    return StorageService.getBatches(defaultBatches);
  });

  const [currentBatchId, setCurrentBatchId] = useState<string>(() => batches[0]?.id || '');
  const currentBatch = batches.find(b => b.id === currentBatchId) || batches[0] || null;

  const handleOpenPdfReport = (batch?: InvoiceBatch | null) => {
    setSelectedAuditPdfBatch(batch || currentBatch || batches[0] || null);
  };

  // Default seed notifications
  const defaultInitialNotifications: EmailNotification[] = [
    {
      id: 'NOTIF-001',
      toEmail: 'sarah.jenkins@abcompany.com',
      toName: 'Sarah Jenkins',
      fromEmail: 'ariba-notifications@abcompany.com',
      subject: 'Action Required: Billing Discrepancy Review for Apex Global Solutions - PO-AB-2026-8941',
      previewText: '3 billing discrepancies flagged for resources (Priya Nair, Lucas Silva, Darren Hayes). Unbudgeted exposure: $5,180.00.',
      contentBody: 'Vendor Apex Global Solutions has initiated the approval workflow for billing month 2026-08. Please verify consultant timesheets in the Manager Review Desk.',
      sentAt: new Date(Date.now() - 3600000).toISOString(),
      read: false,
      poNumber: 'PO-AB-2026-8941',
      batchId: 'initial',
      discrepanciesCount: 3,
      financialImpact: 5180,
      currency: 'USD',
      actionRequiredLink: 'manager',
      directToolUrl: typeof window !== 'undefined' 
        ? `${window.location.origin}${window.location.pathname}?role=manager&manager=sarah.jenkins%40abcompany.com&batch=initial&po=PO-AB-2026-8941`
        : 'https://ais-app.internal/review-desk?role=manager&manager=sarah.jenkins%40abcompany.com&batch=initial&po=PO-AB-2026-8941',
      vendorName: 'Apex Global Solutions',
      billingMonth: '2026-08',
      totalBilledDays: 49,
      totalTimesheetDays: 33,
      matchedCount: 0,
      itemsSummary: [
        {
          id: 'ITEM-001',
          resourceName: 'Priya Nair',
          resourceEmail: 'priya.nair@apexconsulting.com',
          projectCode: 'PRJ-CLOUD-MIGRATE',
          department: 'Cloud Platform Engineering',
          billedDays: 22,
          internalApprovedDays: 18,
          daysVariance: 4,
          contractDailyRate: 920,
          claimedDailyRate: 920,
          financialVarianceAmount: 3680,
          discrepancyType: 'DAYS_OVERBILLED',
          discrepancyReason: 'Vendor billed 22 days against 18 internal approved timesheet days.'
        },
        {
          id: 'ITEM-002',
          resourceName: 'Lucas Silva',
          resourceEmail: 'lucas.silva@apexconsulting.com',
          projectCode: 'PRJ-CLOUD-MIGRATE',
          department: 'Cloud Platform Engineering',
          billedDays: 15,
          internalApprovedDays: 15,
          daysVariance: 0,
          contractDailyRate: 800,
          claimedDailyRate: 900,
          financialVarianceAmount: 1500,
          discrepancyType: 'RATE_MISMATCH',
          discrepancyReason: 'Vendor claimed $900/day exceeding SOW contract rate of $800/day.'
        },
        {
          id: 'ITEM-003',
          resourceName: 'Darren Hayes',
          resourceEmail: 'darren.hayes@contractor.com',
          projectCode: 'PRJ-CLOUD-MIGRATE',
          department: 'Cloud Platform Engineering',
          billedDays: 12,
          internalApprovedDays: 0,
          daysVariance: 12,
          contractDailyRate: 850,
          claimedDailyRate: 850,
          financialVarianceAmount: 10200,
          discrepancyType: 'DAYS_OVERBILLED',
          discrepancyReason: 'No internal timesheet record found in central corporate database for August.'
        }
      ]
    },
    {
      id: 'NOTIF-CLEARANCE-SAMPLE-01',
      toEmail: 'ap@cloudbridge.io',
      toName: 'CloudBridge Billing Desk',
      fromEmail: 'ariba-clearance@abcompany.com',
      fromName: 'AB Company SAP Ariba Clearance Desk',
      subject: '[APPROVED & CLEARED] Pre-Invoice Clearance Certificate Issued for PO PO-AB-2026-6119 (2026-08)',
      previewText: 'Batch cleared for SAP Ariba submission! PICC Certificate PICC-AB-2026-08-882 issued for 4 lines. Cleared Amount: $68,400.00.',
      contentBody: 'Congratulations! The pre-invoice reconciliation for PO PO-AB-2026-6119 (2026-08) from CloudBridge Solutions has reached 100% managerial sign-off and is formally cleared for SAP Ariba Network invoice submission.\n\nPre-Invoice Clearance Certificate (PICC): PICC-AB-2026-08-882\nSAP Ariba Submission Token: ARB-202608-PICC-9941-CLOUDBRIDGE\nTotal Cleared Line Items: 4\nTotal Approved Days: 72 d\nTotal Approved Billing Amount: $68,400.00\nVerification Audit Hash: a9b4c7e2f1d8e3b4a5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8\n\nPlease submit your invoice in SAP Ariba Network with this clearance code for touchless 3-way matching.',
      sentAt: new Date(Date.now() - 7200000).toISOString(),
      read: false,
      poNumber: 'PO-AB-2026-6119',
      batchId: 'BATCH-2026-08-CLOUDBRIDGE',
      discrepanciesCount: 0,
      financialImpact: 0,
      currency: 'USD',
      actionRequiredLink: 'vendor',
      vendorName: 'CloudBridge Solutions',
      billingMonth: '2026-08',
      totalBilledDays: 72,
      totalTimesheetDays: 72,
      matchedCount: 4,
      isClearanceNotification: true,
      clearanceCertificateId: 'PICC-AB-2026-08-882',
      aribaSubmissionCode: 'ARB-202608-PICC-9941-CLOUDBRIDGE',
      verificationAuditHash: 'a9b4c7e2f1d8e3b4a5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8',
      totalClearedAmount: 68400,
      totalClearedDays: 72,
      clearedStatus: 'CLEARED_WITH_APPROVED_EXCEPTIONS',
      senderRole: 'manager',
      senderName: 'David Kim',
      senderEmail: 'david.kim@abcompany.com'
    }
  ];

  const defaultInitialAuditLogs: AuditLogEntry[] = [
    {
      id: 'LOG-001',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      actorEmail: 'billing@apex-tech.com',
      actorName: 'Rajesh Sharma',
      actorRole: 'vendor',
      action: 'BATCH_UPLOADED',
      details: 'Uploaded vendor timesheet invoice file Apex_August_Consulting_Invoice.xlsx for PO-AB-2026-8941.',
      poNumber: 'PO-AB-2026-8941'
    }
  ];

  // Pre-seed notifications with durable localStorage
  const [notifications, setNotifications] = useState<EmailNotification[]>(() => {
    return StorageService.getNotifications(defaultInitialNotifications);
  });

  // Audit Logs with durable localStorage
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    return StorageService.getAuditLogs(defaultInitialAuditLogs);
  });

  // Approval Authority Delegations with durable localStorage
  const [delegations, setDelegations] = useState<ApprovalDelegation[]>(() => {
    return StorageService.getDelegations(INITIAL_DELEGATIONS);
  });

  // Auto-persist state changes to durable storage
  useEffect(() => {
    StorageService.saveBatches(batches);
  }, [batches]);

  useEffect(() => {
    StorageService.saveTimesheets(timesheets);
  }, [timesheets]);

  useEffect(() => {
    StorageService.saveNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    StorageService.saveAuditLogs(auditLogs);
  }, [auditLogs]);

  useEffect(() => {
    StorageService.saveDelegations(delegations);
  }, [delegations]);

  // Modal State
  const [selectedClearanceBatch, setSelectedClearanceBatch] = useState<InvoiceBatch | null>(null);

  // Unread count
  const unreadCount = notifications.filter(n => !n.read).length;

  // Phase 2: Daily Manager Reminders Engine
  const triggerDailyManagerReminders = (force: boolean = false) => {
    const today = new Date().toISOString().split('T')[0];
    const lastRun = StorageService.getLastDailyReminderDate();
    if (!force && lastRun === today) {
      return 0; // Already dispatched today
    }

    // Identify all pending review lines across batches
    const pendingByManager: Record<string, {
      managerName: string;
      managerEmail: string;
      items: { item: DiscrepancyItem; batch: InvoiceBatch }[];
    }> = {};

    batches.forEach(b => {
      b.items.forEach(it => {
        const isPending = it.status === 'SENT_FOR_REVIEW' || 
          it.status === 'PENDING_APPROVAL_INITIATION' || 
          it.status === 'AWAITING_MANAGER_REVIEW' ||
          (!it.managerDecision && it.discrepancyType !== 'PERFECT_MATCH');

        if (isPending) {
          const email = it.managerEmail || 'sarah.jenkins@abcompany.com';
          const name = it.managerName || (email.includes('sarah') ? 'Sarah Jenkins' : email.includes('david') ? 'David Chen' : 'Resource Manager');
          if (!pendingByManager[email]) {
            pendingByManager[email] = { managerName: name, managerEmail: email, items: [] };
          }
          pendingByManager[email].items.push({ item: it, batch: b });
        }
      });
    });

    const newNotifications: EmailNotification[] = [];
    const now = new Date().toISOString();

    Object.values(pendingByManager).forEach(({ managerName, managerEmail, items }) => {
      if (items.length === 0) return;
      const count = items.length;
      const totalExposure = items.reduce((sum, x) => sum + Math.max(0, x.item.financialVarianceAmount), 0);
      const poList = Array.from(new Set(items.map(x => x.batch.poNumber))).join(', ');
      const primeBatch = items[0].batch;

      const dailyNotif: EmailNotification = {
        id: `NOTIF-DAILY-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        toEmail: managerEmail,
        toName: managerName,
        fromEmail: 'daily-digests@abcompany.com',
        fromName: 'AB Enterprise Approval Daemon',
        subject: `[DAILY DIGEST] Action Required: ${count} Pending Timesheet Discrepancies Awaiting Your Approval`,
        previewText: `Daily digest: ${count} pending consultant lines across POs (${poList}). Financial exposure: ${formatCurrency(totalExposure, 'USD')}.`,
        contentBody: `Good day ${managerName},\n\nThis is your automated daily digest of pending consultant timesheet reconciliation items.\n\nYou have ${count} pending billing items awaiting your review and authorization across Purchase Orders (${poList}).\n\nTotal at-risk financial exposure: ${formatCurrency(totalExposure, 'USD')}.\n\nPlease access your Manager Review Desk to review hours and approve or adjust line items before the upcoming billing cycle cutoff to ensure timely SAP Ariba Pre-Invoice Clearance.`,
        sentAt: now,
        read: false,
        poNumber: poList,
        batchId: primeBatch.id,
        discrepanciesCount: count,
        financialImpact: totalExposure,
        currency: primeBatch.currency,
        actionRequiredLink: 'manager',
        vendorName: primeBatch.vendorName,
        billingMonth: primeBatch.billingMonth,
        isReminder: true,
        reminderType: 'DAILY_MANAGER_DIGEST',
        urgency: 'URGENT',
        senderRole: 'admin',
        senderName: 'Daily Approval Digest Cron',
        senderEmail: 'cron-engine@abcompany.com',
        directToolUrl: typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}?role=manager&manager=${encodeURIComponent(managerEmail)}&batch=${primeBatch.id}&po=${encodeURIComponent(primeBatch.poNumber)}`
          : undefined,
        itemsSummary: items.slice(0, 5).map(({ item }) => ({
          id: item.id,
          resourceName: item.resourceName,
          resourceEmail: item.resourceEmail,
          projectCode: item.projectCode,
          department: item.department,
          billedDays: item.billedDays,
          internalApprovedDays: item.internalApprovedDays,
          daysVariance: item.daysVariance,
          contractDailyRate: item.contractDailyRate,
          claimedDailyRate: item.claimedDailyRate,
          financialVarianceAmount: item.financialVarianceAmount,
          discrepancyType: item.discrepancyType,
          discrepancyReason: item.discrepancyReason
        }))
      };
      newNotifications.push(dailyNotif);
    });

    if (newNotifications.length > 0) {
      setNotifications(prev => [...newNotifications, ...prev]);
      StorageService.setLastDailyReminderDate(today);

      // Add audit log
      setAuditLogs(prev => [
        {
          id: `LOG-CRON-${Date.now()}`,
          timestamp: now,
          actorEmail: 'system-cron@abcompany.com',
          actorName: 'Daily Digest Cron Engine',
          actorRole: 'admin',
          action: 'DAILY_MANAGER_REMINDERS_DISPATCHED',
          details: `Dispatched ${newNotifications.length} daily reminder digest email(s) to responsible managers with pending approvals.`,
          poNumber: 'MULTIPLE'
        },
        ...prev
      ]);
    }

    return newNotifications.length;
  };

  // Check and dispatch daily reminders on app load
  useEffect(() => {
    triggerDailyManagerReminders(false);
  }, []);

  // Phase 2, Point 4: Retroactive Timesheet Diff & Batch Refresh
  const handleResyncBatchWithTimesheets = (batchId?: string) => {
    if (batchId) {
      const targetBatch = batches.find(b => b.id === batchId) || currentBatch;
      if (!targetBatch) return;

      const { updatedBatch, diffs, resolvedCount, newDiscrepanciesCount } = resyncBatchWithTimesheets(targetBatch, timesheets);
      
      const previousVariance = targetBatch.netVarianceAmount;
      const newVariance = updatedBatch.netVarianceAmount;
      const diffSummary = diffs.length > 0 ? ` (${diffs.slice(0, 3).join('; ')})` : '';
      const diffText = resolvedCount > 0 
        ? `Auto-resolved ${resolvedCount} item(s) to exact match!${diffSummary}`
        : previousVariance !== newVariance 
          ? `Variance updated from ${formatCurrency(previousVariance, updatedBatch.currency)} to ${formatCurrency(newVariance, updatedBatch.currency)}.${diffSummary}` 
          : `Verified compound keys against ${timesheets.length} central timesheet records.${diffSummary}`;

      const updatedBatches = batches.map(b => b.id === targetBatch.id ? updatedBatch : b);
      setBatches(updatedBatches);
      StorageService.saveBatches(updatedBatches);

      const toastMsg = `Batch ${updatedBatch.poNumber} (${updatedBatch.billingMonth}) re-synced! ${diffText}`;
      setResyncSuccessToast(toastMsg);
      setTimeout(() => setResyncSuccessToast(null), 6000);

      setAuditLogs(prev => [
        {
          id: `LOG-RESYNC-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actorEmail: currentUser.email,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'BATCH_RESYNCED_WITH_TIMESHEETS',
          details: `Retroactively re-synced batch with Timesheet Database. ${diffText} (${updatedBatch.matchedItemsCount} matches, ${updatedBatch.discrepancyItemsCount} discrepancies, ${newDiscrepanciesCount} new issues).`,
          poNumber: updatedBatch.poNumber,
          batchId: updatedBatch.id
        },
        ...prev
      ]);
    } else {
      // Re-sync ALL active batches against timesheet database!
      let totalResolved = 0;
      const allDiffs: string[] = [];
      let batchesChanged = 0;

      const updatedBatches = batches.map(b => {
        const { updatedBatch, diffs, resolvedCount } = resyncBatchWithTimesheets(b, timesheets);
        if (resolvedCount > 0 || diffs.length > 0 || updatedBatch.netVarianceAmount !== b.netVarianceAmount) {
          batchesChanged++;
        }
        totalResolved += resolvedCount;
        allDiffs.push(...diffs);
        return updatedBatch;
      });

      setBatches(updatedBatches);
      StorageService.saveBatches(updatedBatches);

      const diffSummary = allDiffs.length > 0 ? ` (${allDiffs.slice(0, 3).join('; ')})` : '';
      const toastMsg = totalResolved > 0 
        ? `Re-synced all batches! Auto-resolved ${totalResolved} discrepancy item(s) to exact match!${diffSummary}`
        : `Re-synced ${updatedBatches.length} batch(es) against ${timesheets.length} central timesheet records.${diffSummary}`;

      setResyncSuccessToast(toastMsg);
      setTimeout(() => setResyncSuccessToast(null), 6000);

      setAuditLogs(prev => [
        {
          id: `LOG-RESYNC-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actorEmail: currentUser.email,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'ALL_BATCHES_RESYNCED_WITH_TIMESHEETS',
          details: `Re-synced all batches with Timesheet Database. ${totalResolved} items resolved across ${batchesChanged} updated batch(es).`,
          poNumber: currentBatch?.poNumber || 'ALL',
          batchId: 'ALL'
        },
        ...prev
      ]);
    }
  };

  // Reset to factory sample data if user wants fresh demo
  const handleResetToFactoryData = () => {
    StorageService.clearAllData();
    const initialRows = SAMPLE_VENDOR_INVOICE_ROWS['PO-AB-2026-8941'];
    const initialBatch = reconcileInvoiceRows(
      initialRows,
      INITIAL_CENTRAL_TIMESHEETS,
      'Apex Global Solutions',
      'billing@apex-tech.com',
      'PO-AB-2026-8941',
      '2026-08',
      'Apex_August_Consulting_Invoice.xlsx'
    );
    const defaultBatches = [initialBatch, ...SAMPLE_HISTORICAL_BATCHES];
    setBatches(defaultBatches);
    setTimesheets(INITIAL_CENTRAL_TIMESHEETS);
    setNotifications(defaultInitialNotifications);
    setAuditLogs(defaultInitialAuditLogs);
    setDelegations(INITIAL_DELEGATIONS);
    setCurrentBatchId(initialBatch.id);
    setResyncSuccessToast('Reset all demo data and refreshed localStorage persistence!');
    setTimeout(() => setResyncSuccessToast(null), 4000);
  };

  // Handlers
  const handleBatchUpdated = (newBatch: InvoiceBatch) => {
    setBatches(prev => {
      const exists = prev.some(b => b.id === newBatch.id);
      const updated = exists ? prev.map(b => b.id === newBatch.id ? newBatch : b) : [newBatch, ...prev];
      StorageService.saveBatches(updated);
      return updated;
    });
    setCurrentBatchId(newBatch.id);

    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'INVOICE_RECONCILED',
        details: `Processed reconciliation for ${newBatch.poNumber}. Total: ${newBatch.totalLineItems} lines, ${newBatch.discrepancyItemsCount} discrepancies.`,
        poNumber: newBatch.poNumber,
        batchId: newBatch.id
      },
      ...prev
    ]);
  };

  // Automated "Batch Cleared for SAP Ariba Submission" Notification Trigger
  const triggerClearanceNotifications = (
    clearedBatch: InvoiceBatch,
    cert: PreInvoiceClearance,
    approverEmail: string,
    approverName: string
  ) => {
    const now = new Date().toISOString();

    // 1. Notification to Vendor Initiator
    const vendorNotif: EmailNotification = {
      id: `NOTIF-CLEARANCE-VENDOR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      toEmail: clearedBatch.vendorEmail,
      toName: `${clearedBatch.vendorName} Billing Desk`,
      fromEmail: 'ariba-clearance@abcompany.com',
      fromName: 'AB Company SAP Ariba Pre-Invoice Clearance Desk',
      subject: `[APPROVED & CLEARED] Pre-Invoice Clearance Certificate Issued for PO ${clearedBatch.poNumber} (${clearedBatch.billingMonth})`,
      previewText: `Batch cleared for SAP Ariba submission! PICC Certificate ${cert.certificateId} issued for ${clearedBatch.items.length} lines. Cleared Amount: ${formatCurrency(cert.totalClearedAmount, cert.currency)}.`,
      contentBody: `Congratulations! The pre-invoice reconciliation for PO ${clearedBatch.poNumber} (${clearedBatch.billingMonth}) has completed full managerial sign-off and is now 100% cleared for SAP Ariba submission.\n\nPre-Invoice Clearance Certificate (PICC): ${cert.certificateId}\nSAP Ariba Submission Token: ${cert.aribaSubmissionCode}\nTotal Cleared Line Items: ${cert.reconciledLineItemsCount}\nTotal Approved Days: ${cert.totalClearedDays} d\nTotal Approved Billing Amount: ${formatCurrency(cert.totalClearedAmount, cert.currency)}\nVerification Audit Hash: ${cert.verificationAuditHash}\n\nPlease attach this certificate and token when submitting your commercial tax invoice in SAP Ariba Network for touchless automated 3-way matching.`,
      sentAt: now,
      read: false,
      poNumber: clearedBatch.poNumber,
      batchId: clearedBatch.id,
      discrepanciesCount: 0,
      financialImpact: 0,
      currency: clearedBatch.currency,
      actionRequiredLink: 'vendor',
      vendorName: clearedBatch.vendorName,
      billingMonth: clearedBatch.billingMonth,
      totalBilledDays: cert.totalClearedDays,
      totalTimesheetDays: cert.totalClearedDays,
      matchedCount: cert.reconciledLineItemsCount,
      isClearanceNotification: true,
      clearanceCertificateId: cert.certificateId,
      aribaSubmissionCode: cert.aribaSubmissionCode,
      verificationAuditHash: cert.verificationAuditHash,
      totalClearedAmount: cert.totalClearedAmount,
      totalClearedDays: cert.totalClearedDays,
      clearedStatus: cert.status,
      senderRole: 'manager',
      senderName: approverName,
      senderEmail: approverEmail
    };

    // 2. Notification to AP Finance Inbox
    const apFinanceNotif: EmailNotification = {
      id: `NOTIF-CLEARANCE-AP-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      toEmail: 'ap-clearance@abcompany.com',
      toName: 'AB Company AP Finance & Ingestion Team',
      fromEmail: 'ariba-notifications@abcompany.com',
      fromName: 'Automated Procurement Clearance Bot',
      subject: `[PICC NOTIFICATION] PO ${clearedBatch.poNumber} Batch Approved & Cleared for SAP Ariba Ingestion`,
      previewText: `Approval complete for ${clearedBatch.vendorName} on PO ${clearedBatch.poNumber}. Total Approved: ${formatCurrency(cert.totalClearedAmount, cert.currency)}. PICC: ${cert.certificateId}.`,
      contentBody: `A vendor billing batch has reached 100% managerial sign-off and has been granted Pre-Invoice Clearance for SAP Ariba integration.\n\nVendor: ${clearedBatch.vendorName} (${clearedBatch.vendorEmail})\nPurchase Order: ${clearedBatch.poNumber}\nBilling Month: ${clearedBatch.billingMonth}\nPICC Certificate ID: ${cert.certificateId}\nAriba Submission Code: ${cert.aribaSubmissionCode}\nAudit Verification Hash: ${cert.verificationAuditHash}\nAuthorized By: ${approverName} (${approverEmail})\nCleared Line Items: ${cert.reconciledLineItemsCount}\nTotal Approved Amount: ${formatCurrency(cert.totalClearedAmount, cert.currency)}\n\nThe clearance token has been registered in the clearance database. When the vendor submits the corresponding invoice in SAP Ariba, automated 3-way matching will be permitted without discrepancy holds.`,
      sentAt: now,
      read: false,
      poNumber: clearedBatch.poNumber,
      batchId: clearedBatch.id,
      discrepanciesCount: 0,
      financialImpact: 0,
      currency: clearedBatch.currency,
      actionRequiredLink: 'finance',
      vendorName: clearedBatch.vendorName,
      billingMonth: clearedBatch.billingMonth,
      totalBilledDays: cert.totalClearedDays,
      totalTimesheetDays: cert.totalClearedDays,
      matchedCount: cert.reconciledLineItemsCount,
      isClearanceNotification: true,
      clearanceCertificateId: cert.certificateId,
      aribaSubmissionCode: cert.aribaSubmissionCode,
      verificationAuditHash: cert.verificationAuditHash,
      totalClearedAmount: cert.totalClearedAmount,
      totalClearedDays: cert.totalClearedDays,
      clearedStatus: cert.status,
      senderRole: 'manager',
      senderName: approverName,
      senderEmail: approverEmail
    };

    // 3. Automated Executive Copy to Domain COO
    const domainCoo = getDomainCooForManager(
      clearedBatch.items[0]?.managerEmail,
      clearedBatch.items[0]?.department
    );

    const domainCooNotif: EmailNotification = {
      id: `NOTIF-CLEARANCE-COO-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      toEmail: domainCoo.cooEmail,
      toName: `${domainCoo.cooName} (Domain COO - ${domainCoo.domainName})`,
      fromEmail: 'ariba-clearance@abcompany.com',
      fromName: 'AB Company SAP Ariba Pre-Invoice Clearance Desk',
      subject: `[COPY TO DOMAIN COO] Pre-Invoice Clearance Certificate Issued for PO ${clearedBatch.poNumber} (${clearedBatch.billingMonth})`,
      previewText: `Domain COO Executive Copy: Reconciliation flow complete for ${clearedBatch.vendorName} on PO ${clearedBatch.poNumber} (UBR: ${domainCoo.ubrCode}). PICC: ${cert.certificateId}.`,
      contentBody: `Dear ${domainCoo.cooName},\n\nAs the designated Domain COO for ${domainCoo.domainName} (${domainCoo.ubrCode}), you are receiving this executive copy of the Pre-Invoice Clearance Certificate issued upon complete managerial reconciliation.\n\nVendor: ${clearedBatch.vendorName}\nPurchase Order: ${clearedBatch.poNumber}\nUBR / Domain: ${domainCoo.ubrCode} (${domainCoo.domainName})\nBilling Month: ${clearedBatch.billingMonth}\nPre-Invoice Clearance Certificate (PICC): ${cert.certificateId}\nSAP Ariba Submission Token: ${cert.aribaSubmissionCode}\nTotal Cleared Line Items: ${cert.reconciledLineItemsCount}\nTotal Approved Days: ${cert.totalClearedDays} d\nTotal Approved Billing Amount (Pre-Tax): ${formatCurrency(cert.totalClearedAmount, cert.currency)}\nAuthorized Approver: ${approverName} (${approverEmail})\n\nAction Link: Use the Domain COO Ariba Goods Receipt Validator to cross-examine the vendor's actual invoice against this clearance before approving Goods Receipt (GR) in SAP Ariba.`,
      sentAt: now,
      read: false,
      poNumber: clearedBatch.poNumber,
      batchId: clearedBatch.id,
      discrepanciesCount: 0,
      financialImpact: 0,
      currency: clearedBatch.currency,
      actionRequiredLink: 'ariba_validator',
      vendorName: clearedBatch.vendorName,
      billingMonth: clearedBatch.billingMonth,
      totalBilledDays: cert.totalClearedDays,
      totalTimesheetDays: cert.totalClearedDays,
      matchedCount: cert.reconciledLineItemsCount,
      isClearanceNotification: true,
      clearanceCertificateId: cert.certificateId,
      aribaSubmissionCode: cert.aribaSubmissionCode,
      verificationAuditHash: cert.verificationAuditHash,
      totalClearedAmount: cert.totalClearedAmount,
      totalClearedDays: cert.totalClearedDays,
      clearedStatus: cert.status,
      senderRole: 'manager',
      senderName: approverName,
      senderEmail: approverEmail
    };

    setNotifications(prev => [vendorNotif, apFinanceNotif, domainCooNotif, ...prev]);

    setAuditLogs(prev => [
      {
        id: `LOG-CLEARANCE-${Date.now()}`,
        timestamp: now,
        actorEmail: approverEmail,
        actorName: approverName,
        actorRole: 'finance',
        action: 'CLEARANCE_CERTIFICATE_ISSUED_AND_DISPATCHED',
        details: `Pre-Invoice Clearance Certificate ${cert.certificateId} generated. Automated clearance notifications dispatched to Vendor Initiator (${clearedBatch.vendorEmail}), AP Finance (ap-clearance@abcompany.com), and Executive Copy to Domain COO (${domainCoo.cooEmail}, ${domainCoo.ubrCode}). Ariba Code: ${cert.aribaSubmissionCode}.`,
        poNumber: clearedBatch.poNumber,
        batchId: clearedBatch.id
      },
      ...prev
    ]);
  };

  // Vendor Initiates Approval for ALL resources (both routine matches and discrepancy exceptions)
  const handleInitiateApproval = (batch: InvoiceBatch) => {
    // Group line items by manager
    const managerGroups: { 
      [email: string]: { 
        name: string; 
        discrepancies: DiscrepancyItem[]; 
        matches: DiscrepancyItem[]; 
        items: DiscrepancyItem[];
      } 
    } = {};
    
    batch.items.forEach(item => {
      if (!managerGroups[item.managerEmail]) {
        managerGroups[item.managerEmail] = {
          name: item.managerName,
          discrepancies: [],
          matches: [],
          items: []
        };
      }
      managerGroups[item.managerEmail].items.push(item);
      if (item.discrepancyType === 'PERFECT_MATCH') {
        managerGroups[item.managerEmail].matches.push(item);
      } else {
        managerGroups[item.managerEmail].discrepancies.push(item);
      }
    });

    // Generate email notifications for managers with detailed data summary & direct link to the tool
    const newNotifications: EmailNotification[] = [];
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-app.internal';
    const path = typeof window !== 'undefined' ? window.location.pathname : '';

    Object.entries(managerGroups).forEach(([managerEmail, group]) => {
      const discCount = group.discrepancies.length;
      const matchCount = group.matches.length;
      const impact = group.discrepancies.reduce((sum, i) => sum + Math.max(0, i.financialVarianceAmount), 0);
      const directToolUrl = `${origin}${path}?role=manager&manager=${encodeURIComponent(managerEmail)}&batch=${batch.id}&po=${encodeURIComponent(batch.poNumber)}`;

      // Construct detailed summary items of all resources requiring this manager's approval
      const itemsSummary: EmailDiscrepancySummaryItem[] = group.items.map(item => ({
        id: item.id,
        resourceName: item.resourceName,
        resourceEmail: item.resourceEmail,
        projectCode: item.projectCode,
        department: item.department,
        billedDays: item.billedDays,
        internalApprovedDays: item.internalApprovedDays,
        daysVariance: item.daysVariance,
        contractDailyRate: item.contractDailyRate,
        claimedDailyRate: item.claimedDailyRate,
        financialVarianceAmount: item.financialVarianceAmount,
        discrepancyType: item.discrepancyType,
        discrepancyReason: item.discrepancyReason
      }));

      newNotifications.push({
        id: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        toEmail: managerEmail,
        toName: group.name,
        fromEmail: 'ariba-notifications@abcompany.com',
        subject: discCount > 0 
          ? `Action Required: ${discCount} Discrepancies on ${batch.poNumber} (${batch.vendorName})`
          : `Routine Sign-Off: ${matchCount} Matched Resources on ${batch.poNumber}`,
        previewText: discCount > 0
          ? `${discCount} discrepancies flagged requiring your authorization (${formatCurrency(impact, batch.currency)} exposure). ${matchCount} routine matches ready for sign-off.`
          : `All ${matchCount} resources matched internal timesheets 100%. Ready for manager sign-off.`,
        contentBody: `Vendor ${batch.vendorName} has initiated the approval workflow for billing month ${batch.billingMonth}. Please verify consultant timesheets in the Manager Review Desk.`,
        sentAt: new Date().toISOString(),
        read: false,
        poNumber: batch.poNumber,
        batchId: batch.id,
        discrepanciesCount: discCount,
        financialImpact: impact,
        currency: batch.currency,
        actionRequiredLink: 'manager',
        directToolUrl,
        vendorName: batch.vendorName,
        billingMonth: batch.billingMonth,
        totalBilledDays: group.items.reduce((s, i) => s + i.billedDays, 0),
        totalTimesheetDays: group.items.reduce((s, i) => s + i.internalApprovedDays, 0),
        matchedCount: matchCount,
        itemsSummary
      });
    });

    // Update batch status and line items status
    const updatedBatch: InvoiceBatch = {
      ...batch,
      approvalFlowInitiated: true,
      approvalInitiatedAt: new Date().toISOString(),
      status: 'IN_REVIEW',
      items: batch.items.map(item => ({
        ...item,
        status: item.discrepancyType === 'PERFECT_MATCH' ? 'PENDING_ROUTINE_APPROVAL' : 'AWAITING_MANAGER_REVIEW'
      }))
    };

    setBatches(prev => prev.map(b => b.id === batch.id ? updatedBatch : b));
    setNotifications(prev => [...newNotifications, ...prev]);

    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'APPROVAL_FLOW_INITIATED',
        details: `Vendor initiated approval flow for all lines on ${batch.poNumber}. Sent ${newNotifications.length} manager alert notifications.`,
        poNumber: batch.poNumber,
        batchId: batch.id
      },
      ...prev
    ]);
  };

  // Vendor corrects a line item (either before submission or after manager rejection)
  const handleCorrectLineItem = (
    batchId: string,
    itemId: string,
    newDays: number,
    newRate: number,
    notes: string,
    isResubmission: boolean
  ) => {
    let correctedItemInfo: DiscrepancyItem | null = null;
    let targetBatchPo = '';
    let newlyClearedBatch: { batch: InvoiceBatch; cert: PreInvoiceClearance } | null = null;

    setBatches(prev => prev.map(batch => {
      if (batch.id !== batchId) return batch;
      targetBatchPo = batch.poNumber;

      const updatedItems = batch.items.map(item => {
        if (item.id !== itemId) return item;

        const prevDays = item.billedDays;
        const daysVariance = +(newDays - item.internalApprovedDays).toFixed(2);
        const billedTotalAmount = +(newDays * newRate).toFixed(2);
        const financialVarianceAmount = +(Math.max(0, daysVariance) * item.contractDailyRate).toFixed(2);
        
        let newDiscrepancyType = item.discrepancyType;
        if (daysVariance === 0 && newRate === item.contractDailyRate) {
          newDiscrepancyType = 'PERFECT_MATCH';
        } else if (daysVariance > 0) {
          newDiscrepancyType = 'DAYS_OVERBILLED';
        } else if (daysVariance < 0) {
          newDiscrepancyType = 'DAYS_UNDERBILLED';
        } else if (newRate !== item.contractDailyRate) {
          newDiscrepancyType = 'RATE_MISMATCH';
        }

        const updated: DiscrepancyItem = {
          ...item,
          billedDays: newDays,
          claimedDailyRate: newRate,
          billedTotalAmount,
          daysVariance,
          financialVarianceAmount,
          discrepancyType: newDiscrepancyType,
          status: isResubmission 
            ? 'RESUBMITTED_FOR_REVIEW' 
            : (newDiscrepancyType === 'PERFECT_MATCH' ? 'AUTO_MATCHED' : 'AWAITING_MANAGER_REVIEW'),
          vendorCorrection: {
            correctedAt: new Date().toISOString(),
            originalBilledDays: prevDays,
            originalRate: item.claimedDailyRate,
            newBilledDays: newDays,
            newRate,
            notes
          },
          // Clear any old rejection manager decision so manager has a fresh review card
          managerDecision: undefined
        };
        correctedItemInfo = updated;
        return updated;
      });

      // Recalculate batch statistics
      const totalBilledAmount = updatedItems.reduce((sum, i) => sum + i.billedTotalAmount, 0);
      const matchedItemsCount = updatedItems.filter(i => i.discrepancyType === 'PERFECT_MATCH').length;
      const discrepancyItemsCount = updatedItems.filter(i => i.discrepancyType !== 'PERFECT_MATCH').length;
      const netVarianceAmount = updatedItems.reduce((sum, i) => sum + Math.max(0, i.financialVarianceAmount), 0);

      // Check if any rejected line remains
      const anyRejected = updatedItems.some(i => i.status === 'REJECTED_BY_MANAGER');
      const allResolved = updatedItems.every(
        i => (i.discrepancyType === 'PERFECT_MATCH' || !!i.managerDecision) && i.status !== 'REJECTED_BY_MANAGER'
      );

      let batchStatus: BatchApprovalStatus = batch.status;
      let cert = batch.clearanceCertificate;

      if (anyRejected) {
        batchStatus = 'REJECTED_NEEDS_REVISION';
        cert = undefined;
      } else if (allResolved && batch.approvalFlowInitiated) {
        batchStatus = 'CLEARED_FOR_ARIBA';
        cert = generatePreInvoiceClearance({ ...batch, items: updatedItems }, currentUser.email);
        if (batch.status !== 'CLEARED_FOR_ARIBA') {
          newlyClearedBatch = {
            batch: { ...batch, status: batchStatus, items: updatedItems, clearanceCertificate: cert },
            cert
          };
        }
      } else if (batch.approvalFlowInitiated) {
        batchStatus = 'IN_REVIEW';
      }

      return {
        ...batch,
        totalBilledAmount,
        matchedItemsCount,
        discrepancyItemsCount,
        netVarianceAmount,
        status: batchStatus,
        items: updatedItems,
        clearanceCertificate: cert
      };
    }));

    if (newlyClearedBatch) {
      triggerClearanceNotifications(
        newlyClearedBatch.batch,
        newlyClearedBatch.cert,
        currentUser.email,
        currentUser.name
      );
    }

    // If resubmission, alert the manager via automated email
    if (correctedItemInfo) {
      const item = correctedItemInfo as DiscrepancyItem;
      setNotifications(prev => [
        {
          id: `NOTIF-${Date.now()}`,
          toEmail: item.managerEmail,
          toName: item.managerName,
          fromEmail: 'ariba-notifications@abcompany.com',
          subject: `Vendor Resubmitted Correction on ${item.poNumber} (${item.resourceName})`,
          previewText: `Vendor revised claimed days to ${newDays} days. Note: "${notes}". Ready for manager re-approval.`,
          contentBody: `Vendor ${item.vendorName} has corrected the previously rejected line item for ${item.resourceName} (${item.resourceEmail}). Claimed days adjusted from ${item.vendorCorrection?.originalBilledDays} to ${newDays}. Vendor audit note: "${notes}".`,
          sentAt: new Date().toISOString(),
          read: false,
          poNumber: item.poNumber,
          batchId,
          discrepanciesCount: 1,
          financialImpact: item.financialVarianceAmount,
          currency: item.currency,
          actionRequiredLink: 'manager'
        },
        ...prev
      ]);

      setAuditLogs(prev => [
        {
          id: `LOG-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actorEmail: currentUser.email,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'LINE_ITEM_CORRECTED',
          details: `Vendor corrected line item for ${item.resourceName}: adjusted days to ${newDays}. Note: "${notes}". Resubmitted for manager review.`,
          poNumber: targetBatchPo || item.poNumber,
          batchId
        },
        ...prev
      ]);
    }
  };

  // Manager Resolves a Discrepancy (Approve Variance, Adjust to Timesheet, or Reject Billing)
  const handleResolveDiscrepancy = (
    batchId: string,
    itemId: string,
    action: 'APPROVE_VARIANCE' | 'ADJUST_TO_INTERNAL' | 'REJECT_BILLING' | 'APPROVE_ROUTINE',
    justification: string,
    adjustedDays?: number
  ) => {
    let affectedItem: DiscrepancyItem | null = null;
    let targetBatchRef: InvoiceBatch | null = null;
    let newlyClearedBatch: { batch: InvoiceBatch; cert: PreInvoiceClearance } | null = null;

    setBatches(prev => prev.map(batch => {
      if (batch.id !== batchId) return batch;
      targetBatchRef = batch;

      const updatedItems = batch.items.map(item => {
        if (item.id !== itemId) return item;

        let finalDays = item.billedDays;
        let finalAmount = item.billedTotalAmount;

        if (action === 'ADJUST_TO_INTERNAL') {
          finalDays = adjustedDays ?? item.internalApprovedDays;
          finalAmount = finalDays * item.contractDailyRate;
        }

        let newStatus = item.status;
        if (action === 'APPROVE_VARIANCE') newStatus = 'APPROVED_WITH_EXCEPTION';
        else if (action === 'ADJUST_TO_INTERNAL') newStatus = 'ADJUSTED_TO_TIMESHEET';
        else if (action === 'REJECT_BILLING') newStatus = 'REJECTED_BY_MANAGER';
        else if (action === 'APPROVE_ROUTINE') newStatus = 'APPROVED_ROUTINE';

        const updated: DiscrepancyItem = {
          ...item,
          status: newStatus,
          managerDecision: {
            decidedByEmail: currentUser.email,
            decidedByName: currentUser.name,
            decidedAt: new Date().toISOString(),
            action,
            finalApprovedDays: finalDays,
            finalApprovedAmount: finalAmount,
            justificationNotes: justification
          }
        };
        affectedItem = updated;
        return updated;
      });

      // Check rejection status and resolution
      const anyRejected = updatedItems.some(i => i.status === 'REJECTED_BY_MANAGER');
      const allResolved = updatedItems.every(
        i => (i.discrepancyType === 'PERFECT_MATCH' || !!i.managerDecision) && i.status !== 'REJECTED_BY_MANAGER'
      );

      let finalStatus = batch.status;
      let cert = batch.clearanceCertificate;

      if (anyRejected) {
        finalStatus = 'REJECTED_NEEDS_REVISION';
        cert = undefined; // Certificate blocked until corrected
      } else if (allResolved) {
        finalStatus = 'CLEARED_FOR_ARIBA';
        cert = generatePreInvoiceClearance({ ...batch, items: updatedItems }, currentUser.email);
        if (batch.status !== 'CLEARED_FOR_ARIBA') {
          newlyClearedBatch = {
            batch: { ...batch, status: finalStatus, items: updatedItems, clearanceCertificate: cert },
            cert
          };
        }
      } else {
        finalStatus = 'PARTIALLY_RESOLVED';
      }

      return {
        ...batch,
        status: finalStatus,
        items: updatedItems,
        clearanceCertificate: cert
      };
    }));

    // Trigger automated clearance notification to Vendor and AP Finance
    if (newlyClearedBatch) {
      triggerClearanceNotifications(
        newlyClearedBatch.batch,
        newlyClearedBatch.cert,
        currentUser.email,
        currentUser.name
      );
    }

    // If Manager Rejected Line: Alert the Vendor via Automated Email
    if (action === 'REJECT_BILLING') {
      const targetBatch = targetBatchRef || batches.find(b => b.id === batchId);
      const targetItem = affectedItem || targetBatch?.items.find(i => i.id === itemId);

      if (targetBatch && targetItem) {
        setNotifications(prev => [
          {
            id: `NOTIF-${Date.now()}`,
            toEmail: targetBatch.vendorEmail,
            toName: targetBatch.vendorName,
            fromEmail: 'ariba-notifications@abcompany.com',
            subject: `Action Required: Invoice Line Rejected by Manager on ${targetBatch.poNumber}`,
            previewText: `Manager ${currentUser.name} rejected line for ${targetItem.resourceName}. Reason: "${justification}". Please correct and resubmit.`,
            contentBody: `Manager ${currentUser.name} has reviewed your invoice submission for PO ${targetBatch.poNumber} and rejected the line item for ${targetItem.resourceName} (${targetItem.resourceEmail}). Rejection rationale: "${justification}". You must correct your claimed days before pre-invoice clearance can be granted.`,
            sentAt: new Date().toISOString(),
            read: false,
            poNumber: targetBatch.poNumber,
            batchId: targetBatch.id,
            discrepanciesCount: 1,
            financialImpact: targetItem.financialVarianceAmount,
            currency: targetBatch.currency,
            actionRequiredLink: 'vendor'
          },
          ...prev
        ]);
      }
    }

    // Add audit log
    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: `DISCREPANCY_${action}`,
        details: `Manager ${currentUser.name} resolved line for ${affectedItem?.resourceName || itemId}: ${action}. Rationale: "${justification}".`,
        batchId
      },
      ...prev
    ]);
  };

  // Manager 1-Click Routine Matched Lines Sign-Off
  const handleApproveRoutineMatches = (batchId: string, itemIds: string[]) => {
    let newlyClearedBatch: { batch: InvoiceBatch; cert: PreInvoiceClearance } | null = null;

    setBatches(prev => prev.map(batch => {
      if (batch.id !== batchId) return batch;

      const updatedItems = batch.items.map(item => {
        if (!itemIds.includes(item.id)) return item;
        return {
          ...item,
          status: 'APPROVED_ROUTINE' as const,
          managerDecision: {
            decidedByEmail: currentUser.email,
            decidedByName: currentUser.name,
            decidedAt: new Date().toISOString(),
            action: 'APPROVE_ROUTINE' as const,
            finalApprovedDays: item.billedDays,
            finalApprovedAmount: item.billedTotalAmount,
            justificationNotes: 'Routine internal timesheet verification confirmed.'
          }
        };
      });

      const anyRejected = updatedItems.some(i => i.status === 'REJECTED_BY_MANAGER');
      const allResolved = updatedItems.every(
        i => (i.discrepancyType === 'PERFECT_MATCH' || !!i.managerDecision) && i.status !== 'REJECTED_BY_MANAGER'
      );

      let finalStatus = batch.status;
      let cert = batch.clearanceCertificate;

      if (allResolved && !anyRejected) {
        finalStatus = 'CLEARED_FOR_ARIBA';
        cert = generatePreInvoiceClearance({ ...batch, items: updatedItems }, currentUser.email);
        if (batch.status !== 'CLEARED_FOR_ARIBA') {
          newlyClearedBatch = {
            batch: { ...batch, status: finalStatus, items: updatedItems, clearanceCertificate: cert },
            cert
          };
        }
      }

      return {
        ...batch,
        status: finalStatus,
        items: updatedItems,
        clearanceCertificate: cert
      };
    }));

    if (newlyClearedBatch) {
      triggerClearanceNotifications(
        newlyClearedBatch.batch,
        newlyClearedBatch.cert,
        currentUser.email,
        currentUser.name
      );
    }

    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'ROUTINE_MATCHES_APPROVED',
        details: `Manager ${currentUser.name} signed off on ${itemIds.length} routine matched consultant lines for batch ${batchId}.`,
        batchId
      },
      ...prev
    ]);
  };

  const handleSaveDelegation = (newDel: ApprovalDelegation) => {
    setDelegations(prev => {
      const existingIndex = prev.findIndex(d => d.id === newDel.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newDel;
        return updated;
      }
      return [newDel, ...prev];
    });

    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'DELEGATION_RULE_CONFIGURED',
        details: `Configured approval delegation to ${newDel.delegateeName} (${newDel.delegateeEmail}) from ${newDel.startDate} to ${newDel.endDate}. Scope: ${newDel.scope}. Reason: "${newDel.reason}".`
      },
      ...prev
    ]);
  };

  const handleRevokeDelegation = (delId: string) => {
    const target = delegations.find(d => d.id === delId);
    setDelegations(prev => prev.map(d => d.id === delId ? { ...d, active: false } : d));

    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'DELEGATION_RULE_REVOKED',
        details: `Revoked active approval delegation for ${target?.delegateeName || delId}.`
      },
      ...prev
    ]);
  };

  const handleBulkResolve = (
    itemIds: string[],
    action: BulkApprovalAction,
    justification: string
  ) => {
    // Check if acting under active delegation
    const activeDelegation = delegations.find(
      d => d.delegateeEmail.toLowerCase() === currentUser.email.toLowerCase() && d.active
    );

    let newlyClearedBatch: { batch: InvoiceBatch; cert: PreInvoiceClearance } | null = null;

    setBatches(prev => prev.map(batch => {
      let modified = false;
      const updatedItems = batch.items.map(item => {
        if (!itemIds.includes(item.id)) return item;
        modified = true;

        let finalDays = item.billedDays;
        let finalAmount = item.billedTotalAmount;
        let newStatus = item.status;

        if (action === 'APPROVE_VARIANCE') {
          finalDays = item.billedDays;
          finalAmount = item.billedTotalAmount;
          newStatus = 'APPROVED_WITH_EXCEPTION';
        } else if (action === 'ADJUST_TO_INTERNAL') {
          finalDays = item.internalApprovedDays;
          finalAmount = item.internalApprovedDays * item.contractDailyRate;
          newStatus = 'ADJUSTED_TO_TIMESHEET';
        } else if (action === 'APPROVE_ROUTINE') {
          finalDays = item.internalApprovedDays;
          finalAmount = item.internalApprovedTotalAmount;
          newStatus = 'APPROVED_ROUTINE';
        }

        const decisionAction = action === 'APPROVE_ROUTINE' ? 'APPROVE_ROUTINE' : action;

        return {
          ...item,
          status: newStatus,
          managerDecision: {
            decidedByEmail: currentUser.email,
            decidedByName: currentUser.name,
            decidedAt: new Date().toISOString(),
            action: decisionAction,
            finalApprovedDays: finalDays,
            finalApprovedAmount: finalAmount,
            justificationNotes: justification,
            isBulkApproved: true,
            delegatedBy: activeDelegation ? {
              delegatorEmail: activeDelegation.delegatorEmail,
              delegatorName: activeDelegation.delegatorName,
              delegationId: activeDelegation.id
            } : undefined
          }
        };
      });

      if (!modified) return batch;

      // Check if all discrepancies are now resolved
      const remainingDiscrepancies = updatedItems.filter(
        i => i.discrepancyType !== 'PERFECT_MATCH' && !i.managerDecision
      ).length;

      const anyRejected = updatedItems.some(i => i.status === 'REJECTED_BY_MANAGER');

      let finalStatus = batch.status;
      let cert = batch.clearanceCertificate;

      if (anyRejected) {
        finalStatus = 'REJECTED_NEEDS_REVISION';
        cert = undefined;
      } else if (remainingDiscrepancies === 0) {
        finalStatus = 'CLEARED_FOR_ARIBA';
        cert = generatePreInvoiceClearance({ ...batch, items: updatedItems }, currentUser.email);
        if (batch.status !== 'CLEARED_FOR_ARIBA') {
          newlyClearedBatch = {
            batch: { ...batch, status: finalStatus, items: updatedItems, clearanceCertificate: cert },
            cert
          };
        }
      } else {
        finalStatus = 'PARTIALLY_RESOLVED';
      }

      return {
        ...batch,
        status: finalStatus,
        items: updatedItems,
        clearanceCertificate: cert
      };
    }));

    if (newlyClearedBatch) {
      triggerClearanceNotifications(
        newlyClearedBatch.batch,
        newlyClearedBatch.cert,
        currentUser.email,
        currentUser.name
      );
    }

    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'BULK_DISCREPANCY_APPROVAL',
        details: `Bulk resolved ${itemIds.length} items with action ${action}. Justification: "${justification}". ${
          activeDelegation ? `(Executed under authority delegation from ${activeDelegation.delegatorName})` : ''
        }`
      },
      ...prev
    ]);
  };

  const handleAddTimesheet = (newTs: InternalTimesheet) => {
    let updatedTimesheets: InternalTimesheet[] = [];
    setTimesheets(prev => {
      updatedTimesheets = [newTs, ...prev.filter(ts => ts.id !== newTs.id)];
      StorageService.saveTimesheets(updatedTimesheets);
      return updatedTimesheets;
    });

    // Auto-resync active batches against the new timesheet record
    setTimeout(() => {
      setBatches(prevBatches => {
        const refreshed = prevBatches.map(b => {
          const res = resyncBatchWithTimesheets(b, updatedTimesheets);
          return res.updatedBatch;
        });
        StorageService.saveBatches(refreshed);
        return refreshed;
      });
    }, 50);

    // Add audit log
    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'TIMESHEET_ENTRY_ADDED',
        details: `Added new internal timesheet for ${newTs.resourceName} (${newTs.resourceEmail}) under PO ${newTs.poNumber} (${newTs.approvedDays} approved days). Automatically refreshed matching batches.`,
        poNumber: newTs.poNumber
      },
      ...prev
    ]);
  };

  const handleBulkImportTimesheets = (imported: InternalTimesheet[]) => {
    let updatedTimesheets: InternalTimesheet[] = [];
    setTimesheets(prev => {
      const existingKeys = new Set(imported.map(i => `${i.resourceEmail.toLowerCase()}_${i.poNumber}_${i.billingMonth}`));
      const kept = prev.filter(p => !existingKeys.has(`${p.resourceEmail.toLowerCase()}_${p.poNumber}_${p.billingMonth}`));
      updatedTimesheets = [...imported, ...kept];
      StorageService.saveTimesheets(updatedTimesheets);
      return updatedTimesheets;
    });

    // Auto-resync all batches against newly imported timesheets
    setTimeout(() => {
      let resolvedCount = 0;
      setBatches(prevBatches => {
        const refreshed = prevBatches.map(b => {
          const res = resyncBatchWithTimesheets(b, updatedTimesheets);
          resolvedCount += res.resolvedCount;
          return res.updatedBatch;
        });
        StorageService.saveBatches(refreshed);
        return refreshed;
      });

      const toastMsg = `Imported ${imported.length} timesheets! Automatically re-synced batches (${resolvedCount} items auto-resolved).`;
      setResyncSuccessToast(toastMsg);
      setTimeout(() => setResyncSuccessToast(null), 6000);
    }, 50);

    setAuditLogs(prev => [
      {
        id: `LOG-IMPORT-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: currentUser.email,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'TIMESHEETS_BULK_IMPORTED',
        details: `Bulk imported ${imported.length} timesheet records from spreadsheet and auto-resynced all invoice batches.`,
        poNumber: imported[0]?.poNumber || 'MULTIPLE'
      },
      ...prev
    ]);
  };

  const handleNavigateToManager = (managerEmail: string) => {
    // Switch to manager role & tab
    const matchedUser = SAMPLE_USERS.find(u => u.email.toLowerCase() === managerEmail.toLowerCase());
    if (matchedUser) {
      setCurrentUser(matchedUser);
    } else {
      // Fallback to Sarah Jenkins
      setCurrentUser(SAMPLE_USERS[1]);
    }
    setActiveTab('manager');
  };

  const handleOpenSendReminder = (context?: {
    poNumber?: string;
    batchId?: string;
    recipientEmail?: string;
    item?: DiscrepancyItem;
  }) => {
    setReminderInitialContext(context);
    setShowReminderModal(true);
  };

  const handleSendReminder = (payload: ReminderPayload) => {
    const toEmail = payload.recipientEmail || (payload.recipientEmails && payload.recipientEmails[0]) || 'all-stakeholders@abcompany.com';
    const toName = payload.recipientName || (payload.recipientNames && payload.recipientNames[0]) || 'All Stakeholders';
    const senderRole = payload.senderRole || currentUser.role;
    const senderName = payload.senderName || currentUser.name;
    const senderEmail = payload.senderEmail || currentUser.email;
    const poNumber = payload.poNumber || 'PO-AB-2026-8941';
    const batchId = payload.batchId || 'BATCH-001';

    const newNotif: EmailNotification = {
      id: `NOTIF-REMINDER-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      toEmail,
      toName,
      fromEmail: senderEmail,
      fromName: senderName,
      subject: payload.subject || `[${payload.urgency} REMINDER] Action Required: ${poNumber} Reconciliation`,
      previewText: payload.message,
      contentBody: payload.message,
      sentAt: new Date().toISOString(),
      read: false,
      poNumber,
      batchId,
      discrepanciesCount: payload.relatedDiscrepancyId ? 1 : 0,
      financialImpact: 0,
      currency: currentCurrency,
      actionRequiredLink: senderRole === 'vendor' ? 'manager' : 'vendor',
      isReminder: true,
      urgency: payload.urgency,
      reminderMessage: payload.message,
      senderRole,
      targetAudience: payload.targetAudience
    };

    setNotifications(prev => [newNotif, ...prev]);

    setAuditLogs(prev => [
      {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: senderEmail,
        actorName: senderName,
        actorRole: senderRole,
        action: 'REMINDER_DISPATCHED',
        details: `${senderRole.toUpperCase()} ${senderName} dispatched [${payload.urgency}] reminder to ${toName} (${toEmail}) for PO ${poNumber}.`,
        poNumber,
        batchId
      },
      ...prev
    ]);
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Check RBAC access for activeTab
  const isAccessAllowed = canAccessTab(currentUser.role, activeTab);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
      
      {/* Sleek Interface Dark Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-linear-to-br from-amber-500 via-orange-600 to-indigo-700 rounded-xl flex items-center justify-center font-black text-white shadow-md text-xs tracking-wider ring-1 ring-amber-400/30">
              INV
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-white font-bold tracking-tight text-base leading-tight">INV Engine</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded font-mono tracking-tight" title="Internal Combustion Engine inspired: High-Throughput Reconciliation">
                  ICE
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">Invoice Reconciliation Engine</span>
            </div>
          </div>
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs with RBAC auto-alignment and lock indicators */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {(() => {
            const handleNavigateWithRole = (targetTab: string) => {
              if (!canAccessTab(currentUser.role, targetTab)) {
                if (targetTab === 'vendor') {
                  const u = SAMPLE_USERS.find(user => user.role === 'vendor') || SAMPLE_USERS[0];
                  setCurrentUser(u);
                } else if (targetTab === 'manager') {
                  const u = SAMPLE_USERS.find(user => user.role === 'manager') || SAMPLE_USERS[1];
                  setCurrentUser(u);
                } else if (targetTab === 'finance' || targetTab === 'database') {
                  const u = SAMPLE_USERS.find(user => user.role === 'finance' || user.role === 'admin') || SAMPLE_USERS[4];
                  setCurrentUser(u);
                } else if (targetTab === 'ariba_validator') {
                  const u = SAMPLE_USERS.find(user => user.role === 'domain_coo') || SAMPLE_USERS[1];
                  setCurrentUser(u);
                }
              }
              setActiveTab(targetTab);
              setMobileMenuOpen(false);
            };

            return (
              <>
                {/* Domain COO Ariba GR Validator Tab */}
                {(() => {
                  const allowed = canAccessTab(currentUser.role, 'ariba_validator');
                  return (
                    <div
                      id="sidebar-nav-ariba-validator"
                      onClick={() => handleNavigateWithRole('ariba_validator')}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                        activeTab === 'ariba_validator'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : allowed
                          ? 'text-indigo-200 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center opacity-90 text-base">🛡️</div>
                        <span>Ariba GR Validator</span>
                      </div>
                      <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-400/40">Domain COO</span>
                    </div>
                  );
                })()}

                {/* Vendor Tab */}
                {(() => {
                  const allowed = canAccessTab(currentUser.role, 'vendor');
                  return (
                    <div
                      id="sidebar-nav-vendor"
                      onClick={() => handleNavigateWithRole('vendor')}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                        activeTab === 'vendor'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : allowed
                          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center opacity-85 text-base">📁</div>
                        <span>Invoice Upload & Portal</span>
                      </div>
                      {!allowed && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">Auto-Role</span>
                      )}
                    </div>
                  );
                })()}

                {/* Manager Tab */}
                {(() => {
                  const allowed = canAccessTab(currentUser.role, 'manager');
                  return (
                    <div
                      id="sidebar-nav-manager"
                      onClick={() => handleNavigateWithRole('manager')}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                        activeTab === 'manager'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : allowed
                          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center opacity-85 text-base">⚖️</div>
                        <span>Reconciliation & Review</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!allowed ? (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">Auto-Role</span>
                        ) : currentBatch && currentBatch.discrepancyItemsCount > 0 ? (
                          <span className="bg-red-500 text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold">
                            {currentBatch.discrepancyItemsCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

                {/* Finance Tab */}
                {(() => {
                  const allowed = canAccessTab(currentUser.role, 'finance');
                  return (
                    <div
                      id="sidebar-nav-finance"
                      onClick={() => handleNavigateWithRole('finance')}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                        activeTab === 'finance'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : allowed
                          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center opacity-85 text-base">📊</div>
                        <span>Billing Mismatches</span>
                      </div>
                      {!allowed && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">Auto-Role</span>
                      )}
                    </div>
                  );
                })()}

                {/* Timesheet Database Tab */}
                {(() => {
                  const allowed = canAccessTab(currentUser.role, 'database');
                  return (
                    <div
                      id="sidebar-nav-database"
                      onClick={() => handleNavigateWithRole('database')}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                        activeTab === 'database'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : allowed
                          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center opacity-85 text-base">🗄️</div>
                        <span>Timesheet Database</span>
                      </div>
                      {!allowed && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">Auto-Role</span>
                      )}
                    </div>
                  );
                })()}

                {/* Notifications Tab */}
                {(() => {
                  const allowed = canAccessTab(currentUser.role, 'notifications');
                  return (
                    <div
                      id="sidebar-nav-notifications"
                      onClick={() => handleNavigateWithRole('notifications')}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                        activeTab === 'notifications'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : allowed
                          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-500 hover:bg-slate-800/60 opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center opacity-85 text-base">🛡️</div>
                        <span>Email Alerts</span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="bg-amber-500 text-[10px] px-1.5 py-0.5 rounded-full text-slate-950 font-bold">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </nav>

        {/* RBAC Policy Inspector Link */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={() => setShowRbacModal(true)}
            className="w-full flex items-center justify-between p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-lg text-xs text-slate-300 font-medium transition-colors"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>RBAC Policy Matrix</span>
            </div>
            <span className="text-[10px] text-blue-400 font-bold uppercase">View</span>
          </button>

          {/* Durable Persistence Status & Factory Reset */}
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-800/40 rounded-lg border border-slate-700/40 text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Durable Storage: <strong>Active</strong></span>
            </div>
            <button
              onClick={handleResetToFactoryData}
              className="text-[10px] text-slate-400 hover:text-amber-300 font-medium underline transition-colors"
              title="Reset application to factory sample data"
            >
              Reset Demo
            </button>
          </div>

          {/* Current User Card */}
          <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
            <div className="w-8 h-8 rounded-full bg-blue-600/80 text-white flex items-center justify-center text-xs font-bold shrink-0 uppercase">
              {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white font-medium truncate">{currentUser.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border ${ROLE_CONFIGS[currentUser.role]?.badgeColor}`}>
                  {ROLE_CONFIGS[currentUser.role]?.label}
                </span>
              </div>
            </div>
          </div>
        </div>

      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Sleek Top Header */}
        <Header
          currentUser={currentUser}
          onSelectUser={(u) => {
            setCurrentUser(u);
            // If tab is not allowed for new role, navigate to their primary tab
            if (!canAccessTab(u.role, activeTab)) {
              const primaryTab = u.role === 'vendor' ? 'vendor' : u.role === 'manager' ? 'manager' : u.role === 'domain_coo' ? 'ariba_validator' : 'finance';
              setActiveTab(primaryTab);
            }
          }}
          currentCurrency={currentCurrency}
          onChangeCurrency={setCurrentCurrency}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          unreadNotificationsCount={unreadCount}
          onOpenNotifications={() => setActiveTab('notifications')}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenClearanceModal={() => currentBatch && setSelectedClearanceBatch(currentBatch)}
          onOpenSendReminder={() => handleOpenSendReminder()}
          onOpenPdfReport={() => handleOpenPdfReport(currentBatch)}
        />

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-slate-50">
          
          {/* Retroactive Timesheet Re-Sync Toast */}
          {resyncSuccessToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{resyncSuccessToast}</span>
              </div>
              <button
                onClick={() => setResyncSuccessToast(null)}
                className="text-xs text-emerald-600 hover:text-emerald-900 font-bold px-2 py-0.5"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* RBAC Access Denied Fallback */}
          {!isAccessAllowed ? (
            <AccessDenied
              currentUser={currentUser}
              attemptedTab={activeTab}
              onNavigateToAllowed={(tab) => setActiveTab(tab)}
              onSwitchUser={(user) => {
                setCurrentUser(user);
                setActiveTab(activeTab);
              }}
            />
          ) : (
            <>
              {activeTab === 'vendor' && (
                <VendorPortal
                  currentUser={currentUser}
                  currentCurrency={currentCurrency}
                  timesheets={timesheets}
                  currentBatch={currentBatch}
                  batches={batches}
                  onBatchUpdated={handleBatchUpdated}
                  onInitiateApproval={handleInitiateApproval}
                  onOpenAribaCertificate={(batch) => setSelectedClearanceBatch(batch)}
                  onCorrectLineItem={handleCorrectLineItem}
                  onNavigateToManager={handleNavigateToManager}
                  onNavigateToNotifications={() => setActiveTab('notifications')}
                  onOpenSendReminder={handleOpenSendReminder}
                  onOpenPdfReport={handleOpenPdfReport}
                  onResyncWithTimesheets={handleResyncBatchWithTimesheets}
                />
              )}

              {activeTab === 'manager' && (
                <ManagerPortal
                  currentUser={currentUser}
                  currentCurrency={currentCurrency}
                  batches={batches}
                  onResolveDiscrepancy={handleResolveDiscrepancy}
                  onSelectManager={setCurrentUser}
                  onApproveMatchedLines={handleApproveRoutineMatches}
                  delegations={delegations}
                  onSaveDelegation={handleSaveDelegation}
                  onRevokeDelegation={handleRevokeDelegation}
                  onBulkResolve={handleBulkResolve}
                  auditLogs={auditLogs}
                  onOpenSendReminder={handleOpenSendReminder}
                  onResyncWithTimesheets={handleResyncBatchWithTimesheets}
                  onOpenPdfReport={handleOpenPdfReport}
                  onSendNotification={(notif) => {
                    setNotifications(prev => [notif, ...prev]);
                  }}
                />
              )}

              {activeTab === 'finance' && (
                <FinanceDashboard
                  currentUser={currentUser}
                  currentCurrency={currentCurrency}
                  batches={batches}
                  auditLogs={auditLogs}
                  onOpenClearanceCertificate={(batch) => setSelectedClearanceBatch(batch)}
                  onNavigateToManager={handleNavigateToManager}
                  delegations={delegations}
                  onBulkResolve={handleBulkResolve}
                  onSaveDelegation={handleSaveDelegation}
                  onRevokeDelegation={handleRevokeDelegation}
                  onOpenPdfReport={handleOpenPdfReport}
                />
              )}

              {activeTab === 'database' && (
                <TimesheetDatabaseView
                  timesheets={timesheets}
                  currentCurrency={currentCurrency}
                  onAddTimesheet={handleAddTimesheet}
                  onBulkImportTimesheets={handleBulkImportTimesheets}
                  currentUser={currentUser}
                  onResyncWithTimesheets={() => handleResyncBatchWithTimesheets()}
                />
              )}

              {activeTab === 'notifications' && (
                <EmailNotificationCenter
                  notifications={notifications}
                  currentCurrency={currentCurrency}
                  onNavigateToManager={handleNavigateToManager}
                  onNavigateToVendor={() => setActiveTab('vendor')}
                  onNavigateToFinance={() => setActiveTab('finance')}
                  onOpenClearanceCertificate={(batchId) => {
                    const targetBatch = batches.find(b => b.id === batchId) 
                      || batches.find(b => !!b.clearanceCertificate) 
                      || batches[0];
                    if (targetBatch) {
                      setSelectedClearanceBatch(targetBatch);
                    }
                  }}
                  onOpenPdfReport={(batchId) => {
                    const targetBatch = batches.find(b => b.id === batchId) || currentBatch || batches[0];
                    if (targetBatch) {
                      handleOpenPdfReport(targetBatch);
                    }
                  }}
                  onMarkAsRead={(id) => {
                    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
                  }}
                  onOpenSendReminder={() => handleOpenSendReminder()}
                  onTriggerDailyReminders={() => triggerDailyManagerReminders(true)}
                />
              )}

              {activeTab === 'ariba_validator' && (
                <AribaGrValidator
                  batches={batches}
                  currentUser={currentUser}
                  formatCurrency={formatCurrency}
                  onLogAudit={(action, details, batchId, poNumber) => {
                    setAuditLogs(prev => [
                      {
                        id: `LOG-${Date.now()}`,
                        timestamp: new Date().toISOString(),
                        actorEmail: currentUser.email,
                        actorName: currentUser.name,
                        actorRole: currentUser.role,
                        action,
                        details,
                        poNumber,
                        batchId
                      },
                      ...prev
                    ]);
                  }}
                  onSendNotification={(notif) => {
                    setNotifications(prev => [notif, ...prev]);
                  }}
                />
              )}
            </>
          )}

        </div>

        {/* Sleek Bottom Status Footer */}
        <footer className="h-10 bg-slate-100 border-t border-slate-200 px-6 sm:px-8 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
          <div className="flex gap-4">
            <span>Audit ID: <strong className="text-slate-700 font-mono">RECON-2026-AB-882</strong></span>
            <span className="hidden sm:inline">Active Security Role: <strong className="text-slate-700 capitalize">{currentUser.role}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>Automated Manager Alerts: Operational</span>
          </div>
        </footer>

      </main>

      {/* SAP Ariba Pre-Invoice Clearance Certificate Modal */}
      {selectedClearanceBatch && (
        <AribaClearanceModal
          batch={selectedClearanceBatch}
          currentCurrency={currentCurrency}
          onClose={() => setSelectedClearanceBatch(null)}
          onOpenPdfReport={handleOpenPdfReport}
        />
      )}

      {/* Printable PDF Batch Summary & PICC Clearance Audit Report Modal */}
      {selectedAuditPdfBatch && (
        <AuditPdfReportModal
          isOpen={!!selectedAuditPdfBatch}
          onClose={() => setSelectedAuditPdfBatch(null)}
          batch={selectedAuditPdfBatch}
          currentCurrency={currentCurrency}
          auditLogs={auditLogs}
          currentUser={currentUser}
        />
      )}

      {/* Stakeholder Reminder Dispatch Modal */}
      {showReminderModal && (
        <SendReminderModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setReminderInitialContext(undefined);
          }}
          currentUser={currentUser}
          batches={batches}
          onSendReminder={handleSendReminder}
          initialPoNumber={reminderInitialContext?.poNumber}
          initialRecipientEmail={reminderInitialContext?.recipientEmail}
          initialItem={reminderInitialContext?.item}
        />
      )}

      {/* RBAC Security Policy & Permissions Matrix Modal */}
      {showRbacModal && (
        <RbacPolicyModal
          isOpen={showRbacModal}
          onClose={() => setShowRbacModal(false)}
          currentRole={currentUser.role}
          onSelectUser={(u) => setCurrentUser(u)}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

    </div>
  );
}
