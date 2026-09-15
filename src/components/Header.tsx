import React from 'react';
import { 
  Bell, 
  Menu,
  FileCheck2, 
  DollarSign, 
  ShieldCheck,
  Building2,
  BellRing,
  Printer,
  Lock
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
        return 'AB Company Internal Verification Portal';
      case 'manager':
        return 'Resource Manager Authorization Queue';
      case 'finance':
        return 'Corporate Accounts Payable & Financial Control';
      case 'database':
        return 'Central Approved Timesheet Records';
      case 'notifications':
        return 'Automated Alert Dispatch Log';
      case 'ariba_validator':
        return 'Domain COO Invoice Alignment & SAP Ariba Goods Receipt Pre-Check';
      default:
        return 'AB Company Internal Verification Portal';
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
        
        {/* Local Currency Badge: Locked to Local Currency of Purchase Order */}
        <div 
          id="po-currency-indicator"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
          title="Currency is automatically locked to the Local Currency of the Purchase Order"
        >
          <span className="text-slate-500 font-normal">PO Currency:</span>
          <span className="font-bold text-slate-900">{currentCurrency}</span>
        </div>

        {/* Role Identity & Switcher (Only Admin has access to switch roles) */}
        {currentUser.role === 'admin' ? (
          <div className="relative flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 hidden lg:inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-600" />
              <span>Admin Role Switcher</span>
            </span>
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
              <optgroup label="🛡️ Global Administration">
                <option value="user-admin-1">David Kim (Global Admin & Systems)</option>
              </optgroup>
              <optgroup label="🏢 Vendor Access">
                <option value="user-vendor-1">Rajesh Sharma (Apex Global Vendor)</option>
                <option value="user-vendor-2">Emily Watson (Accenture Vendor)</option>
              </optgroup>
              <optgroup label="👤 AB Resource Managers">
                <option value="user-manager-1">Sarah Jenkins (Cloud Platform)</option>
                <option value="user-manager-2">David Chen (Core Applications)</option>
                <option value="user-manager-3">Elena Rostova (Data Platforms)</option>
              </optgroup>
              <optgroup label="👔 Domain COO Executive Group">
                <option value="user-coo-1">Marcus Sterling (Domain COO - Cloud)</option>
                <option value="user-coo-2">Victoria Vance (Domain COO - Core Apps)</option>
              </optgroup>
              <optgroup label="🏛️ AP Finance Controller">
                <option value="user-finance-1">Michael Scott (Global AP Controller)</option>
              </optgroup>
            </select>
          </div>
        ) : (
          <div 
            id="locked-user-profile-badge"
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" 
            title="Logged-in Profile (Role switching restricted to System Administrators)"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <div className="flex flex-col text-left">
              <span className="font-bold text-slate-800 flex items-center gap-1 leading-tight">
                {currentUser.name}
                <Lock className="w-3 h-3 text-slate-400" />
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {currentUser.role === 'vendor' 
                  ? `Vendor: ${currentUser.vendorName || 'Apex Global Solutions'}`
                  : currentUser.role === 'manager'
                  ? `Manager: ${currentUser.department ? currentUser.department.split('&')[0].trim() : 'AB Company'}`
                  : currentUser.role.toUpperCase()}
              </span>
            </div>
          </div>
        )}

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
