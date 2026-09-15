import { DiscrepancyItem, InvoiceBatch, EscalationStatus, EmailNotification } from '../types';
import { getDomainCooForManager, getSkipLevelManagerForManager } from '../data/mockCentralDb';

/**
 * Calculate elapsed working days (Mon-Fri) between two timestamps
 */
export function calculateWorkingDays(startDateStr: string, endDateStr: string = new Date().toISOString()): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return 0;
  }

  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);

  const target = new Date(end);
  target.setHours(0, 0, 0, 0);

  while (cur < target) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) { // Not Sunday (0) and not Saturday (6)
      count++;
    }
  }

  return count;
}

/**
 * Calculate total calendar days elapsed
 */
export function calculateCalendarDays(startDateStr: string, endDateStr: string = new Date().toISOString()): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return 0;
  }

  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Evaluate escalation status for a batch or line item based on business policy:
 * - Rule 1: > 4 working days without manager action -> Escalate to Manager's Manager (Skip-level)
 * - Rule 2: >= 7 calendar days total elapsed -> Escalate to Domain COO
 */
export function evaluateItemEscalation(
  item: DiscrepancyItem,
  batchInitiatedAt?: string,
  simulatedDaysOffset: number = 0
): EscalationStatus {
  // If item is already resolved, not escalated
  if (item.status === 'APPROVED_WITH_EXCEPTION' || item.status === 'ADJUSTED_TO_TIMESHEET' || item.status === 'APPROVED_ROUTINE' || item.status === 'AUTO_MATCHED') {
    return {
      isEscalated: false,
      escalationLevel: 'NONE',
      elapsedDays: 0,
      elapsedWorkingDays: 0
    };
  }

  const baseDateStr = batchInitiatedAt || item.managerDecision?.decidedAt || new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString();
  const baseDate = new Date(baseDateStr);
  
  // Apply simulation offset if any
  const simulatedNow = new Date(Date.now() + simulatedDaysOffset * 24 * 60 * 60 * 1000);
  
  const elapsedDays = Math.max(0, calculateCalendarDays(baseDate.toISOString(), simulatedNow.toISOString()));
  const elapsedWorkingDays = Math.max(0, calculateWorkingDays(baseDate.toISOString(), simulatedNow.toISOString()));

  const managerEmail = item.managerEmail;
  const skipLevel = getSkipLevelManagerForManager(managerEmail);
  const domainCoo = getDomainCooForManager(managerEmail);

  // Policy check:
  // 1. Total 7+ calendar days elapsed -> Domain COO Escalation
  if (elapsedDays >= 7) {
    return {
      isEscalated: true,
      escalationLevel: 'LEVEL_2_COO_ESCALATION',
      elapsedDays,
      elapsedWorkingDays,
      escalatedToEmail: domainCoo.cooEmail,
      escalatedToName: domainCoo.cooName,
      escalatedToRole: 'Domain COO Group',
      escalatedAt: new Date().toISOString(),
      reason: `Total of ${elapsedDays} days elapsed without manager action. Escalated to Domain COO ${domainCoo.cooName} (${domainCoo.domainName}) for executive intervention.`
    };
  }

  // 2. > 4 working days elapsed -> Manager's Manager Escalation
  if (elapsedWorkingDays >= 4) {
    return {
      isEscalated: true,
      escalationLevel: 'LEVEL_1_MANAGER_ESCALATION',
      elapsedDays,
      elapsedWorkingDays,
      escalatedToEmail: skipLevel.skipLevelEmail,
      escalatedToName: skipLevel.skipLevelName,
      escalatedToRole: skipLevel.skipLevelTitle,
      escalatedAt: new Date().toISOString(),
      reason: `Exceeded 4 working days SLA (${elapsedWorkingDays} working days elapsed) without action by ${item.managerName}. Escalated to ${skipLevel.skipLevelName} (${skipLevel.skipLevelTitle}).`
    };
  }

  // Normal / Within SLA
  return {
    isEscalated: false,
    escalationLevel: 'NONE',
    elapsedDays,
    elapsedWorkingDays
  };
}

/**
 * Generate automated escalation notification email to Domain COO (for 7-day rule)
 * or Skip-Level Manager (for 4 working day rule)
 */
export function buildEscalationNotification(
  batch: InvoiceBatch,
  escalatedItems: DiscrepancyItem[],
  escalationLevel: 'LEVEL_1_MANAGER_ESCALATION' | 'LEVEL_2_COO_ESCALATION'
): EmailNotification {
  const sampleItem = escalatedItems[0];
  const managerName = sampleItem?.managerName || 'Assigned Manager';
  const managerEmail = sampleItem?.managerEmail || 'manager@abcompany.com';
  const domainCoo = getDomainCooForManager(managerEmail);
  const skipLevel = getSkipLevelManagerForManager(managerEmail);

  const isCooLevel = escalationLevel === 'LEVEL_2_COO_ESCALATION';
  const toEmail = isCooLevel ? domainCoo.cooEmail : skipLevel.skipLevelEmail;
  const toName = isCooLevel ? `${domainCoo.cooName} (Domain COO)` : `${skipLevel.skipLevelName} (${skipLevel.skipLevelTitle})`;

  const subject = isCooLevel
    ? `[EXECUTIVE ESCALATION - 7 DAYS ELAPSED] Domain COO Action Required for PO ${batch.poNumber} (${batch.vendorName})`
    : `[SLA BREACH ESCALATION - 4 WORKING DAYS] Manager Review Delayed for PO ${batch.poNumber} (${batch.vendorName})`;

  const previewText = isCooLevel
    ? `Reconciliation batch for PO ${batch.poNumber} has exceeded 7 days SLA without managerial sign-off. Escalated to Domain COO.`
    : `Manager ${managerName} has not acted within 4 working days on PO ${batch.poNumber}. Escalated to Skip-Level Manager.`;

  const contentBody = isCooLevel
    ? `Dear ${domainCoo.cooName},\n\nThis is an automated executive escalation alert from the AB Company SAP Ariba Pre-Invoice Reconciliation System.\n\nThe reconciliation batch for Purchase Order ${batch.poNumber} (${batch.billingMonth}) from ${batch.vendorName} has been pending for 7 or more calendar days without managerial resolution.\n\nEscalation Summary:\n- Purchase Order: ${batch.poNumber}\n- UBR / Business Unit: ${domainCoo.ubrCode}\n- Domain: ${domainCoo.domainName}\n- Assigned Manager: ${managerName} (${managerEmail})\n- Pending Items Count: ${escalatedItems.length}\n- Total Exposure: ${batch.currency} ${Math.abs(batch.netVarianceAmount).toLocaleString()}\n\nAs Domain COO, you are authorized to act as an executive delegate to resolve these lines directly, adjust to internal timesheets, or authorize variance exceptions to prevent delivery and vendor payment delays.`
    : `Dear ${skipLevel.skipLevelName},\n\nThis is an automated SLA breach escalation from the Pre-Invoice Reconciliation Desk.\n\nManager ${managerName} (${managerEmail}) has not acted on ${escalatedItems.length} reconciliation line items for PO ${batch.poNumber} within the mandated 4 working days SLA window.\n\nEscalation Summary:\n- Purchase Order: ${batch.poNumber}\n- Vendor: ${batch.vendorName}\n- Billed Month: ${batch.billingMonth}\n- Unresolved Lines: ${escalatedItems.length}\n- Variance Amount: ${batch.currency} ${Math.abs(batch.netVarianceAmount).toLocaleString()}\n\nPlease review these lines or prompt the resource manager for immediate resolution before this batch crosses into 7-day Domain COO escalation.`;

  return {
    id: `NOTIF-ESCALATION-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    toEmail,
    toName,
    fromEmail: 'sla-governance@abcompany.com',
    fromName: 'AB Company SLA Governance & Escalation Bot',
    subject,
    previewText,
    contentBody,
    sentAt: new Date().toISOString(),
    read: false,
    poNumber: batch.poNumber,
    batchId: batch.id,
    discrepanciesCount: escalatedItems.length,
    financialImpact: Math.abs(batch.netVarianceAmount),
    currency: batch.currency,
    actionRequiredLink: 'manager',
    vendorName: batch.vendorName,
    billingMonth: batch.billingMonth,
    isReminder: true,
    urgency: isCooLevel ? 'CRITICAL' : 'URGENT',
    senderRole: 'admin',
    senderName: 'SLA Automated Governance',
    senderEmail: 'sla-governance@abcompany.com'
  };
}
