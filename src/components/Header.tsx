import React from 'react';
import { 
  Bell, 
  Menu,
  FileCheck2, 
  DollarSign, 
  ShieldCheck,
  Building2,
  BellRing,
  Printer
} from 'lucide-react';
import { UserProfile, Currency } from '../types';
import { SAMPLE_USERS } from '../data/mockCentralDb';

interface HeaderProps {
  currentUser: UserProfile;
  onSelectUser: (user: UserProfile) => void;
  currentCurrency: Currency;
  onChangeCurrency: (curr: Currency) => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  unreadNotificationsCount: number;
  onOpenNotifications: () => void;
  onOpenMobileMenu?: () => void;
  onOpenClearanceModal?: () => void;
  onOpenSendReminder?: () => void;
  onOpenPdfReport?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onSelectUser,
  currentCurrency,
  onChangeCurrency,
  activeTab,
  onChangeTab,
  unreadNotificationsCount,
  onOpenNotifications,
  onOpenMobileMenu,
  onOpenClearanceModal,
  onOpenSendReminder,
  onOpenPdfReport
}) => {
  const getTabTitle = () => {
    switch (activeTab) {
      case 'vendor':
        return 'Pre-Invoice Clearance';
      case 'manager':
        return 'Discrepancy Approvals';
      case 'finance':
        return 'Billing Mismatch Dashboard';
      case 'database':
        return 'Central Timesheet Master';
      case 'notifications':
        return 'Manager Notification Relay';
      case 'ariba_validator':
        return 'Ariba GR Pre-Receipt Validator';
      default:
        return 'Pre-Invoice Clearance';
    }
  };

  const getTabSubtitle = () => {
    switch (activeTab) {
      case 'vendor':
        return 'INV Engine | Pre-Invoice Clearance & Internal Verification Desk';
      case 'manager':
        return 'INV Engine | Resource Manager Discrepancy Authorization Queue';
      case 'finance':
        return 'INV Engine | Corporate Accounts Payable & Financial Control';
      case 'database':
        return 'INV Engine | Central Approved Timesheet Master Repository';
      case 'notifications':
        return 'INV Engine | Automated Alert Dispatch Log & Escalations';
      case 'ariba_validator':
        return 'INV Engine | Domain COO Invoice Alignment & SAP Ariba Goods Receipt Pre-Check';
      default:
        return 'INV Engine | Invoice Reconciliation Engine';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between shrink-0 shadow-2xs">
      
      {/* Title & Mobile Menu Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            {getTabTitle()}
          </h1>
          <p className="text-xs text-slate-500 hidden sm:block">
            {getTabSubtitle()}
          </p>
        </div>
      </div>

      {/* Right Controls: Currency, Role, Alerts, Action Button */}
      <div className="flex items-center gap-3">
        
        {/* Currency Badge (Matches Sleek Interface: px-3 py-1 bg-slate-100 rounded-md border border-slate-200 text-xs font-semibold) */}
        <div className="hidden sm:flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-md border border-slate-200 text-xs font-semibold text-slate-700">
          <span>Currency:</span>
          <select
            id="currency-select"
            value={currentCurrency}
            onChange={(e) => onChangeCurrency(e.target.value as Currency)}
            className="bg-transparent text-slate-900 font-bold focus:outline-hidden cursor-pointer"
            title="Select Local Currency for Financial Calculations"
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="INR">INR (₹)</option>
            <option value="SGD">SGD (S$)</option>
          </select>
        </div>

        {/* Role Switcher */}
        <div className="relative">
          <select
            id="rbac-role-switcher"
            value={currentUser.id}
            onChange={(e) => {
              const selected = SAMPLE_USERS.find(u => u.id === e.target.value);
              if (selected) {
                onSelectUser(selected);
                if (selected.role === 'vendor') onChangeTab('vendor');
                if (selected.role === 'manager') onChangeTab('manager');
                if (selected.role === 'finance' || selected.role === 'admin') onChangeTab('finance');
                if (selected.role === 'domain_coo') onChangeTab('ariba_validator');
              }
            }}
            className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          >
            <optgroup label="👔 Domain COO Executive Group">
              <option value="user-coo-1">Marcus Sterling (Domain COO - Cloud)</option>
              <option value="user-coo-2">Victoria Vance (Domain COO - Core Apps)</option>
            </optgroup>
            <optgroup label="🛡️ Global Administration">
              <option value="user-admin-1">David Kim (Global Admin & Systems)</option>
            </optgroup>
            <optgroup label="🏢 Vendor Access">
              <option value="user-vendor-1">Rajesh Sharma (Apex Global Vendor)</option>
            </optgroup>
            <optgroup label="👤 AB Resource Managers">
              <option value="user-manager-1">Sarah Jenkins (Cloud Platform)</option>
              <option value="user-manager-2">David Chen (Core Applications)</option>
              <option value="user-manager-3">Elena Rostova (Data Platforms)</option>
            </optgroup>
            <optgroup label="🏛️ AP Finance Controller">
              <option value="user-finance-1">Michael Scott (Global AP Controller)</option>
            </optgroup>
          </select>
        </div>

        {/* Send Reminder Quick Button */}
        {onOpenSendReminder && (
          <button
            id="header-send-reminder-btn"
            onClick={onOpenSendReminder}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
            title="Dispatch Reminder to Stakeholders"
          >
            <BellRing className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden lg:inline">Send Reminder</span>
          </button>
        )}

        {/* Notification Bell */}
        <button
          id="quick-bell-btn"
          onClick={onOpenNotifications}
          className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="View Automated Email Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
        </button>

        {/* PDF Audit Report Button */}
        {onOpenPdfReport && (
          <button
            id="header-export-pdf-report-btn"
            onClick={onOpenPdfReport}
            className="hidden sm:inline-flex items-center gap-1.5 bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-800 shadow-xs transition-colors"
            title="Export Current Batch Summary and Clearance Certificate as Printable PDF"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            <span>Audit PDF</span>
          </button>
        )}

        {/* Primary Action Button (Matches Sleek Interface: bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700) */}
        {onOpenClearanceModal && (
          <button
            onClick={onOpenClearanceModal}
            className="hidden sm:inline-flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 shadow-xs transition-colors"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Ariba Clearance</span>
          </button>
        )}

      </div>

    </header>
  );
};
