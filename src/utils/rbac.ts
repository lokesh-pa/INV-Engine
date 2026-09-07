import { Role, Permission } from '../types';

export interface RoleConfig {
  role: Role;
  label: string;
  badgeLabel: string;
  badgeColor: string;
  description: string;
  allowedTabs: string[];
  permissions: Permission[];
}

export const ROLE_CONFIGS: Record<Role, RoleConfig> = {
  vendor: {
    role: 'vendor',
    label: 'Vendor (Service Provider)',
    badgeLabel: 'Vendor Portal',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Can only upload invoices, view own reconciliation status, correct invoice lines before submission or after manager rejection, and trigger approval workflows.',
    allowedTabs: ['vendor', 'notifications'],
    permissions: [
      'UPLOAD_INVOICES',
      'VIEW_OWN_RECONCILIATION',
      'CORRECT_INVOICE_LINES',
      'INITIATE_APPROVAL_WORKFLOW',
      'VIEW_ARIBA_CLEARANCE'
    ]
  },
  manager: {
    role: 'manager',
    label: 'Resource Manager',
    badgeLabel: 'Manager Queue',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Can review assigned resources, sign off on matched lines, approve discrepancy variances with justification, adjust to timesheets, or reject invoice lines back to the vendor.',
    allowedTabs: ['manager', 'notifications'],
    permissions: [
      'REVIEW_ASSIGNED_RESOURCES',
      'APPROVE_MATCHED_LINES',
      'APPROVE_DISCREPANCIES',
      'ADJUST_TO_TIMESHEET',
      'REJECT_INVOICE_LINE'
    ]
  },
  admin: {
    role: 'admin',
    label: 'System & Finance Administrator',
    badgeLabel: 'Global Admin',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Has full system governance: oversees global mismatch dashboards, manages central timesheet master database, audits approval logs, manages RBAC policies, and releases clearance certificates.',
    allowedTabs: ['vendor', 'manager', 'finance', 'database', 'notifications'],
    permissions: [
      'UPLOAD_INVOICES',
      'VIEW_OWN_RECONCILIATION',
      'CORRECT_INVOICE_LINES',
      'INITIATE_APPROVAL_WORKFLOW',
      'VIEW_ARIBA_CLEARANCE',
      'REVIEW_ASSIGNED_RESOURCES',
      'APPROVE_MATCHED_LINES',
      'APPROVE_DISCREPANCIES',
      'ADJUST_TO_TIMESHEET',
      'REJECT_INVOICE_LINE',
      'VIEW_ALL_VENDORS',
      'MANAGE_TIMESHEET_DB',
      'OVERRIDE_APPROVALS',
      'VIEW_AUDIT_LOGS',
      'MANAGE_RBAC_POLICIES'
    ]
  },
  finance: {
    role: 'finance',
    label: 'Finance & AP Controller (Admin)',
    badgeLabel: 'Finance Admin',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Corporate Accounts Payable administrator with full fiscal oversight across all vendor purchase orders and clearance controls.',
    allowedTabs: ['vendor', 'manager', 'finance', 'database', 'notifications'],
    permissions: [
      'UPLOAD_INVOICES',
      'VIEW_OWN_RECONCILIATION',
      'CORRECT_INVOICE_LINES',
      'INITIATE_APPROVAL_WORKFLOW',
      'VIEW_ARIBA_CLEARANCE',
      'REVIEW_ASSIGNED_RESOURCES',
      'APPROVE_MATCHED_LINES',
      'APPROVE_DISCREPANCIES',
      'ADJUST_TO_TIMESHEET',
      'REJECT_INVOICE_LINE',
      'VIEW_ALL_VENDORS',
      'MANAGE_TIMESHEET_DB',
      'OVERRIDE_APPROVALS',
      'VIEW_AUDIT_LOGS',
      'MANAGE_RBAC_POLICIES'
    ]
  }
};

/**
 * Check if a role possesses a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const config = ROLE_CONFIGS[role];
  if (!config) return false;
  return config.permissions.includes(permission);
}

/**
 * Check if a role can access a navigation tab
 */
export function canAccessTab(role: Role, tab: string): boolean {
  const config = ROLE_CONFIGS[role];
  if (!config) return false;
  return config.allowedTabs.includes(tab);
}

/**
 * Get required role name for a tab
 */
export function getRequiredRoleForTab(tab: string): string {
  switch (tab) {
    case 'vendor':
      return 'Vendor or Administrator';
    case 'manager':
      return 'Resource Manager or Administrator';
    case 'finance':
      return 'Administrator / AP Finance Controller';
    case 'database':
      return 'Administrator (Central Timesheet Database)';
    default:
      return 'Authorized Role';
  }
}
