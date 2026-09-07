export type Role = 'vendor' | 'manager' | 'admin' | 'finance';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'SGD';

export type Permission = 
  | 'UPLOAD_INVOICES'              // Vendor: upload billing sheets
  | 'VIEW_OWN_RECONCILIATION'      // Vendor: view own reconciliation & batches
  | 'CORRECT_INVOICE_LINES'        // Vendor: edit/align line items before or after rejection
  | 'INITIATE_APPROVAL_WORKFLOW'   // Vendor: submit all lines for manager approval
  | 'VIEW_ARIBA_CLEARANCE'         // Vendor/Finance: view pre-invoice clearance certificate
  | 'REVIEW_ASSIGNED_RESOURCES'    // Manager: review lines for assigned resources
  | 'APPROVE_MATCHED_LINES'        // Manager: sign off on routine matched lines
  | 'APPROVE_DISCREPANCIES'        // Manager: authorize variance exceptions
  | 'ADJUST_TO_TIMESHEET'          // Manager: force line to internal timesheet
  | 'REJECT_INVOICE_LINE'          // Manager: reject line requiring vendor revision
  | 'VIEW_ALL_VENDORS'             // Admin: global visibility across all POs
  | 'MANAGE_TIMESHEET_DB'          // Admin: CRUD on central internal timesheets
  | 'OVERRIDE_APPROVALS'           // Admin: override or release held certificates
  | 'VIEW_AUDIT_LOGS'              // Admin: inspect full audit trails
  | 'MANAGE_RBAC_POLICIES';        // Admin: configure security roles & permissions

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  vendorName?: string;
  department?: string;
  avatarUrl?: string;
}

export interface InternalTimesheet {
  id: string;
  resourceEmail: string; // Common identifier
  resourceName: string;
  poNumber: string;
  poLineItem?: string; // PO Line Item (short for purchase order line item, e.g., '00010', '10')
  admSeniority?: string; // ADM Seniority (e.g., 'Senior', 'Lead', 'Principal')
  admRole?: string; // ADM Role (e.g., 'Cloud Solutions Architect', 'Full Stack Developer')
  locationCity?: string; // Resource Location (City) (e.g., 'Chicago', 'New York')
  vendorName: string;
  billingMonth: string; // e.g., '2026-08'
  approvedDays: number;
  approvedHours: number; // approvedDays * 8
  contractDailyRate: number;
  currency: Currency;
  projectCode: string;
  projectName: string;
  department: string;
  managerEmail: string;
  managerName: string;
  status: 'Approved' | 'Submitted' | 'Draft';
  lastLoggedDate: string;
}

export interface VendorInvoiceRow {
  id: string;
  resourceEmail: string; // Common identifier
  resourceName: string;
  poNumber: string; // Purchase Order Number
  poLineItem?: string; // PO Line Item (short for purchase order line item, e.g., '00010', '10')
  admSeniority?: string; // ADM Seniority (e.g., 'Senior', 'Lead', 'Principal', 'Associate')
  admRole?: string; // ADM Role (e.g., 'Cloud Solutions Architect', 'Full Stack Developer', 'Data Engineer')
  locationCity?: string; // Resource Location (City) (e.g., 'Chicago', 'New York', 'London')
  billingMonth: string;
  billedDays: number;
  claimedDailyRate: number;
  currency: Currency;
  lineItemDescription?: string;
  vendorNotes?: string;
}

export type DiscrepancySeverity = 'MATCH' | 'MINOR' | 'CRITICAL' | 'UNMAPPED';

export type DiscrepancyType = 
  | 'PERFECT_MATCH'
  | 'DAYS_OVERBILLED'      // Vendor billed more days than AB timesheet
  | 'DAYS_UNDERBILLED'     // Vendor billed fewer days than AB timesheet
  | 'RATE_MISMATCH'        // Billed daily rate differs from PO contract rate
  | 'RESOURCE_NOT_FOUND'   // Email ID not found in internal timesheets for this PO/period
  | 'CROSS_PO_MISMATCH'    // Resource timesheet found under a different PO (cross-PO billing error)
  | 'TIMESHEET_UNAPPROVED';// Timesheet found but not yet signed off internally

export interface TaxConfig {
  taxType: 'VAT' | 'GST' | 'SALES_TAX' | 'NONE';
  taxRate: number; // e.g. 0, 5, 8.25, 10, 19, 20
  taxJurisdiction: string; // e.g. 'US-CA', 'DE-FEDERAL', 'UK-HMRC', 'SG-IRAS', 'IN-GST'
  isReverseCharge: boolean;
  withholdingTaxRate: number; // e.g. 0, 2, 5, 10 (deducted at source)
  taxExemptionReason?: string;
}

export interface TaxCalculationResult {
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  withholdingTaxRate: number;
  withholdingTaxAmount: number;
  grossAmount: number;
  netPayableAmount: number;
  isReverseCharge: boolean;
  taxType: string;
  taxJurisdiction: string;
}

export type DiscrepancyStatus = 
  | 'PENDING_APPROVAL_INITIATION' // Vendor hasn't initiated approval yet
  | 'PENDING_ROUTINE_APPROVAL'    // Routine match awaiting manager sign-off
  | 'AWAITING_MANAGER_REVIEW'     // Discrepancy awaiting manager review
  | 'APPROVED_WITH_EXCEPTION'     // Manager approved variance with reason
  | 'ADJUSTED_TO_TIMESHEET'       // Settled to internal timesheet approved days
  | 'REJECTED_BY_MANAGER'         // Manager rejected line, vendor must correct & resubmit
  | 'RESUBMITTED_FOR_REVIEW'      // Vendor corrected and resubmitted, awaiting manager re-approval
  | 'APPROVED_ROUTINE'            // Routine match approved by manager
  | 'AUTO_MATCHED';               // Matched line

export interface DiscrepancyItem {
  id: string;
  batchId: string;
  invoiceRowId: string;
  resourceEmail: string;
  resourceName: string;
  vendorName: string;
  poNumber: string; // Purchase Order Number
  poLineItem?: string; // PO Line Item (short for purchase order line item, e.g., '00010', '10')
  admSeniority?: string; // ADM Seniority
  admRole?: string; // ADM Role
  locationCity?: string; // Resource Location (City)
  billingMonth: string;
  currency: Currency;
  
  // Quantities in DAYS
  billedDays: number;
  internalApprovedDays: number;
  daysVariance: number; // billedDays - internalApprovedDays
  
  // Financial Rates & Totals
  claimedDailyRate: number;
  contractDailyRate: number;
  billedTotalAmount: number;
  internalApprovedTotalAmount: number;
  financialVarianceAmount: number; // billedTotalAmount - internalApprovedTotalAmount
  
  // Categorization
  discrepancyType: DiscrepancyType;
  discrepancyReason?: string;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
  
  // Manager Assignment
  managerEmail: string;
  managerName: string;
  department: string;
  projectCode: string;
  
  // Vendor Correction History
  vendorCorrection?: {
    correctedAt: string;
    originalBilledDays: number;
    originalRate: number;
    newBilledDays: number;
    newRate: number;
    notes: string;
  };

  // Resolution details
  managerDecision?: {
    decidedByEmail: string;
    decidedByName: string;
    decidedAt: string;
    action: 'APPROVE_VARIANCE' | 'ADJUST_TO_INTERNAL' | 'REJECT_BILLING' | 'APPROVE_ROUTINE';
    finalApprovedDays: number;
    finalApprovedAmount: number;
    justificationNotes: string;
    isBulkApproved?: boolean;
    delegatedBy?: {
      delegatorEmail: string;
      delegatorName: string;
    };
  };
}

export type BatchApprovalStatus = 
  | 'DRAFT_UPLOAD'           // Vendor just uploaded, viewing match/mismatch
  | 'IN_REVIEW'              // Vendor initiated approval, managers notified
  | 'PARTIALLY_RESOLVED'     // Some managers approved, some pending
  | 'CLEARED_FOR_ARIBA'      // All items resolved/matched, pre-invoice clearance issued
  | 'REJECTED_NEEDS_REVISION';// One or more items rejected

export interface InvoiceBatch {
  id: string;
  batchNumber: string;
  vendorName: string;
  vendorEmail: string;
  poNumber: string;
  billingMonth: string;
  currency: Currency;
  uploadedAt: string;
  fileName: string;
  totalLineItems: number;
  matchedItemsCount: number;
  discrepancyItemsCount: number;
  
  totalBilledAmount: number;
  totalInternalApprovedAmount: number;
  netVarianceAmount: number;
  
  approvalFlowInitiated: boolean;
  approvalInitiatedAt?: string;
  status: BatchApprovalStatus;
  
  items: DiscrepancyItem[];
  
  // Tax configuration
  taxConfig?: TaxConfig;

  // Duplicate & Revision tracking
  isRevision?: boolean;
  revisionNumber?: number;
  duplicateOfBatchId?: string;
  duplicateWarning?: string;

  // Pre-invoice clearance for SAP Ariba
  clearanceCertificate?: PreInvoiceClearance;
}

export interface PreInvoiceClearance {
  certificateId: string; // e.g. 'AB-PICC-2026-0811'
  batchId: string;
  poNumber: string;
  vendorName: string;
  billingMonth: string;
  currency: Currency;
  issuedAt: string;
  issuedBy: string;
  totalClearedDays: number;
  totalClearedAmount: number;
  reconciledLineItemsCount: number;
  aribaSubmissionCode: string; // Unique hash/token for Ariba invoice attachment
  verificationAuditHash: string;
  status: 'CLEARED_EXACT' | 'CLEARED_WITH_APPROVED_EXCEPTIONS' | 'HELD';
  notes: string;
  taxConfig?: TaxConfig;
  taxCalculation?: TaxCalculationResult;
}

export interface EmailDiscrepancySummaryItem {
  id: string;
  resourceName: string;
  resourceEmail: string;
  projectCode?: string;
  department?: string;
  billedDays: number;
  internalApprovedDays: number;
  daysVariance: number;
  contractDailyRate: number;
  claimedDailyRate?: number;
  financialVarianceAmount: number;
  discrepancyType: string;
  discrepancyReason?: string;
}

export interface EmailNotification {
  id: string;
  toEmail: string;
  toName: string;
  fromEmail: string;
  subject: string;
  previewText: string;
  contentBody: string;
  sentAt: string;
  read: boolean;
  poNumber: string;
  batchId: string;
  discrepanciesCount: number;
  financialImpact: number;
  currency: Currency;
  actionRequiredLink: string;
  // Enhanced summary data that requires approval
  vendorName?: string;
  billingMonth?: string;
  totalBilledDays?: number;
  totalTimesheetDays?: number;
  matchedCount?: number;
  itemsSummary?: EmailDiscrepancySummaryItem[];
  directToolUrl?: string;
  // Reminder Capabilities
  isReminder?: boolean;
  reminderType?: 'ADMIN_TO_EVERYONE' | 'ADMIN_TO_MANAGERS' | 'ADMIN_TO_VENDORS' | 'VENDOR_TO_MANAGERS' | 'MANAGER_TO_VENDORS' | 'CUSTOM_NUDGE' | 'DAILY_MANAGER_DIGEST';
  urgency?: 'NORMAL' | 'URGENT' | 'CRITICAL';
  senderRole?: Role;
  senderName?: string;
  senderEmail?: string;
  fromName?: string;
  reminderMessage?: string;
  targetAudience?: string;
  // PICC Clearance Email Fields
  isClearanceNotification?: boolean;
  clearanceCertificateId?: string;
  aribaSubmissionCode?: string;
  verificationAuditHash?: string;
  totalClearedAmount?: number;
  totalClearedDays?: number;
  clearedStatus?: 'CLEARED_EXACT' | 'CLEARED_WITH_APPROVED_EXCEPTIONS' | 'HELD';
}

export interface ReminderPayload {
  targetAudience: 'EVERYONE' | 'ALL_MANAGERS' | 'ALL_VENDORS' | 'SPECIFIC_MANAGER' | 'SPECIFIC_VENDOR';
  recipientEmails: string[];
  recipientNames: string[];
  subject: string;
  message: string;
  urgency: 'NORMAL' | 'URGENT' | 'CRITICAL';
  poNumber?: string;
  batchId?: string;
  senderRole?: Role;
  senderName?: string;
  senderEmail?: string;
  recipientEmail?: string;
  recipientName?: string;
  relatedDiscrepancyId?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorEmail: string;
  actorName: string;
  actorRole: Role;
  action: string;
  details: string;
  poNumber?: string;
  batchId?: string;
  isDelegated?: boolean;
  delegatedByEmail?: string;
}

export interface ApprovalDelegation {
  id: string;
  delegatorEmail: string;
  delegatorName: string;
  delegatorDepartment?: string;
  delegateeEmail: string;
  delegateeName: string;
  delegateeDepartment?: string;
  reason: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD or 'INDEFINITE'
  scope: 'ALL_RESOURCES' | 'SPECIFIC_PO';
  poNumber?: string;
  active: boolean;
  createdAt: string;
}

export type BulkApprovalAction = 'APPROVE_VARIANCE' | 'ADJUST_TO_INTERNAL' | 'APPROVE_ROUTINE';

export interface BulkApprovalRequest {
  itemIds: string[];
  action: BulkApprovalAction;
  justificationNotes: string;
  adjustedDaysMap?: { [itemId: string]: number };
}

