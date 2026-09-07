import React from 'react';
import { ShieldAlert, ArrowLeft, UserCheck, Lock, CheckCircle, ExternalLink } from 'lucide-react';
import { UserProfile } from '../types';
import { ROLE_CONFIGS, getRequiredRoleForTab } from '../utils/rbac';
import { SAMPLE_USERS } from '../data/mockCentralDb';

interface AccessDeniedProps {
  currentUser: UserProfile;
  attemptedTab: string;
  onNavigateToAllowed: (tab: string) => void;
  onSwitchUser: (user: UserProfile) => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  currentUser,
  attemptedTab,
  onNavigateToAllowed,
  onSwitchUser
}) => {
  const currentConfig = ROLE_CONFIGS[currentUser.role];
  const requiredRole = getRequiredRoleForTab(attemptedTab);

  // Suggested user to switch to based on attempted tab
  const suggestedUser = attemptedTab === 'vendor'
    ? SAMPLE_USERS.find(u => u.role === 'vendor') || SAMPLE_USERS[0]
    : attemptedTab === 'manager' 
    ? SAMPLE_USERS.find(u => u.role === 'manager') || SAMPLE_USERS[1]
    : SAMPLE_USERS.find(u => u.role === 'finance' || u.role === 'admin') || SAMPLE_USERS[4];

  const handleSwitchAndProceed = (targetUser: UserProfile, targetTab?: string) => {
    onSwitchUser(targetUser);
    onNavigateToAllowed(targetTab || attemptedTab);
  };

  return (
    <div className="max-w-3xl mx-auto my-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Banner */}
      <div className="bg-amber-500/10 border-b border-amber-200/60 p-6 flex items-start sm:items-center gap-4">
        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 shrink-0">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
              RBAC Role Boundary
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Segregation of Duties
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
            Role Permission Required: {requiredRole}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            You are currently signed in as <strong className="text-slate-800">{currentUser.name}</strong> ({currentConfig.label}). 
            Select an authorized persona below to enter this view.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Quick Role Switcher Grid */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Switch Persona to Proceed Immediately:
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* Vendor */}
            <div 
              onClick={() => handleSwitchAndProceed(SAMPLE_USERS[0], 'vendor')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:shadow-xs ${
                currentUser.role === 'vendor' 
                  ? 'bg-purple-50/50 border-purple-300 ring-2 ring-purple-400/20' 
                  : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900">Vendor Portal</span>
                {currentUser.role === 'vendor' && (
                  <span className="text-[10px] bg-purple-200 text-purple-800 font-bold px-1.5 py-0.2 rounded">Current</span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-700 mt-1">Rajesh Sharma</p>
              <p className="text-[10px] text-slate-500">Apex Global Solutions</p>
              <button
                type="button"
                className="mt-3 w-full py-1.5 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Open as Vendor</span>
              </button>
            </div>

            {/* Resource Manager */}
            <div 
              onClick={() => handleSwitchAndProceed(SAMPLE_USERS[1], 'manager')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:shadow-xs ${
                currentUser.role === 'manager' 
                  ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-400/20' 
                  : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900">Resource Manager</span>
                {currentUser.role === 'manager' && (
                  <span className="text-[10px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.2 rounded">Current</span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-700 mt-1">Sarah Jenkins</p>
              <p className="text-[10px] text-slate-500">Cloud Platform Lead</p>
              <button
                type="button"
                className="mt-3 w-full py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Open as Manager</span>
              </button>
            </div>

            {/* Finance / Admin */}
            <div 
              onClick={() => handleSwitchAndProceed(SAMPLE_USERS[4], attemptedTab === 'database' ? 'database' : 'finance')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:shadow-xs ${
                currentUser.role === 'finance' || currentUser.role === 'admin'
                  ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-400/20' 
                  : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">AP Controller (Admin)</span>
                {(currentUser.role === 'finance' || currentUser.role === 'admin') && (
                  <span className="text-[10px] bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.2 rounded">Current</span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-700 mt-1">Michael Scott</p>
              <p className="text-[10px] text-slate-500">Corporate Finance Admin</p>
              <button
                type="button"
                className="mt-3 w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Open as Finance Admin</span>
              </button>
            </div>

          </div>
        </div>

        {/* Policy Explanation */}
        <div className="text-xs text-slate-600 leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
          <strong className="text-slate-800 block mb-1">Why is this segregation enforced?</strong>
          <p>
            To prevent fraud and maintain strict accounting compliance, external vendors are restricted from viewing internal timesheet master tables or approving their own invoices. Internal resource managers approve hours for their teams, while corporate AP administrators govern global clearance and disbursement.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            id="rbac-return-allowed-btn"
            onClick={() => onNavigateToAllowed(currentConfig.allowedTabs[0])}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Permitted View ({currentConfig.allowedTabs[0]})</span>
          </button>

          {suggestedUser && (
            <button
              id="rbac-switch-authorized-role-btn"
              onClick={() => handleSwitchAndProceed(suggestedUser, attemptedTab)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Continue to {attemptedTab} as {suggestedUser.name} ({suggestedUser.role})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
