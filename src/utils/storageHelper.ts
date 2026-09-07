import { 
  InvoiceBatch, 
  InternalTimesheet, 
  AuditLogEntry, 
  EmailNotification, 
  ApprovalDelegation 
} from '../types';

const STORAGE_KEYS = {
  BATCHES: 'AB_ARIBACLEAR_BATCHES_V2',
  TIMESHEETS: 'AB_ARIBACLEAR_TIMESHEETS_V2',
  AUDIT_LOGS: 'AB_ARIBACLEAR_LOGS_V2',
  NOTIFICATIONS: 'AB_ARIBACLEAR_NOTIFICATIONS_V2',
  DELEGATIONS: 'AB_ARIBACLEAR_DELEGATIONS_V2',
  LAST_DAILY_REMINDER: 'AB_ARIBACLEAR_LAST_DAILY_REMINDER_V2'
};

/**
 * Safely parse JSON from localStorage with fallback
 */
function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const item = window.localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);
    return parsed ?? fallback;
  } catch (err) {
    console.warn(`[StorageHelper] Failed to read ${key} from localStorage:`, err);
    return fallback;
  }
}

/**
 * Safely save data to localStorage
 */
function safeSet<T>(key: string, data: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`[StorageHelper] Failed to write ${key} to localStorage:`, err);
  }
}

export const StorageService = {
  getBatches(fallback: InvoiceBatch[]): InvoiceBatch[] {
    const stored = safeGet<InvoiceBatch[] | null>(STORAGE_KEYS.BATCHES, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    return fallback;
  },

  saveBatches(batches: InvoiceBatch[]): void {
    safeSet(STORAGE_KEYS.BATCHES, batches);
  },

  getTimesheets(fallback: InternalTimesheet[]): InternalTimesheet[] {
    const stored = safeGet<InternalTimesheet[] | null>(STORAGE_KEYS.TIMESHEETS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    return fallback;
  },

  saveTimesheets(timesheets: InternalTimesheet[]): void {
    safeSet(STORAGE_KEYS.TIMESHEETS, timesheets);
  },

  getAuditLogs(fallback: AuditLogEntry[]): AuditLogEntry[] {
    const stored = safeGet<AuditLogEntry[] | null>(STORAGE_KEYS.AUDIT_LOGS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    return fallback;
  },

  saveAuditLogs(logs: AuditLogEntry[]): void {
    safeSet(STORAGE_KEYS.AUDIT_LOGS, logs);
  },

  getNotifications(fallback: EmailNotification[]): EmailNotification[] {
    const stored = safeGet<EmailNotification[] | null>(STORAGE_KEYS.NOTIFICATIONS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    return fallback;
  },

  saveNotifications(notifications: EmailNotification[]): void {
    safeSet(STORAGE_KEYS.NOTIFICATIONS, notifications);
  },

  getDelegations(fallback: ApprovalDelegation[]): ApprovalDelegation[] {
    const stored = safeGet<ApprovalDelegation[] | null>(STORAGE_KEYS.DELEGATIONS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    return fallback;
  },

  saveDelegations(delegations: ApprovalDelegation[]): void {
    safeSet(STORAGE_KEYS.DELEGATIONS, delegations);
  },

  getLastDailyReminderDate(): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(STORAGE_KEYS.LAST_DAILY_REMINDER);
  },

  setLastDailyReminderDate(dateStr: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEYS.LAST_DAILY_REMINDER, dateStr);
  },

  clearAllData(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    Object.values(STORAGE_KEYS).forEach(k => {
      window.localStorage.removeItem(k);
    });
  }
};
