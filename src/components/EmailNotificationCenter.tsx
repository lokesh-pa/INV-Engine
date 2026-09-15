import React, { useState, useMemo } from 'react';
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
  Download,
  Search,
  Trash2,
  Archive,
  Folder,
  Tag,
  Reply,
  ReplyAll,
  Forward,
  Printer,
  ChevronDown,
  MoreHorizontal,
  FileSpreadsheet,
  Settings,
  HelpCircle,
  Grid,
  Bell,
  Star,
  Flag,
  RotateCcw,
  CheckSquare,
  Filter,
  SlidersHorizontal,
  Bookmark
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
  const [selectedFolder, setSelectedFolder] = useState<'INBOX' | 'APPROVALS' | 'CLEARANCE' | 'REMINDERS' | 'SENT' | 'ARCHIVE' | 'DELETED'>('INBOX');
  const [mailboxTab, setMailboxTab] = useState<'FOCUSED' | 'OTHER'>('FOCUSED');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('ALL');
  const [selectedEmailId, setSelectedEmailId] = useState<string>(
    notifications.length > 0 ? notifications[0].id : ''
  );
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  // Derive counts
  const remindersCount = notifications.filter(n => n.isReminder).length;
  const clearanceCount = notifications.filter(n => n.isClearanceNotification).length;
  const approvalsCount = notifications.filter(n => !n.isReminder && !n.isClearanceNotification).length;
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Filtered emails
  const filteredEmails = useMemo(() => {
    return notifications.filter(email => {
      // Folder filtering
      if (selectedFolder === 'APPROVALS' && (email.isReminder || email.isClearanceNotification)) return false;
      if (selectedFolder === 'CLEARANCE' && !email.isClearanceNotification) return false;
      if (selectedFolder === 'REMINDERS' && !email.isReminder) return false;
      if (selectedFolder === 'SENT') return false; // sent simulator
      if (selectedFolder === 'ARCHIVE' || selectedFolder === 'DELETED') return false;

      // Mailbox tab: Focused vs Other (Outlook style: approvals and critical reminders in Focused, general digests in Other)
      if (mailboxTab === 'FOCUSED') {
        if (email.isReminder && email.urgency === 'ROUTINE') return false;
      }

      // Vendor filter
      if (selectedVendorFilter !== 'ALL') {
        const vendorMatch = (email.vendorName && email.vendorName.toLowerCase().includes(selectedVendorFilter.toLowerCase())) ||
          (email.poNumber && email.poNumber.toLowerCase().includes(selectedVendorFilter.toLowerCase()));
        if (!vendorMatch) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = 
          email.subject.toLowerCase().includes(q) ||
          email.toName.toLowerCase().includes(q) ||
          email.toEmail.toLowerCase().includes(q) ||
          email.poNumber.toLowerCase().includes(q) ||
          (email.vendorName && email.vendorName.toLowerCase().includes(q)) ||
          email.previewText.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [notifications, selectedFolder, mailboxTab, selectedVendorFilter, searchQuery]);

  const selectedEmail = useMemo(() => {
    return notifications.find(e => e.id === selectedEmailId) || (filteredEmails.length > 0 ? filteredEmails[0] : null);
  }, [notifications, selectedEmailId, filteredEmails]);

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

  const toggleFlag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlaggedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Avatar background colors in Outlook palette
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-[#0078D4] text-white',
      'bg-[#107C41] text-white',
      'bg-[#5C2D91] text-white',
      'bg-[#D83B01] text-white',
      'bg-[#008272] text-white',
      'bg-[#A4262C] text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getInitials = (name?: string) => {
    if (!name) return 'AB';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4 pb-12 font-sans">
      
      {/* Outer Outlook Frame */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-md overflow-hidden flex flex-col">
        
        {/* 1. Outlook Top Blue Brand Bar (#0078D4 Microsoft 365 Blue) */}
        <header className="bg-[#0078D4] text-white px-4 py-2.5 flex items-center justify-between gap-4 select-none">
          {/* Left: App Launcher & Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <button 
              className="p-1.5 hover:bg-[#106ebe] rounded-md transition-colors cursor-pointer text-white/90 hover:text-white"
              title="Microsoft 365 App Launcher"
            >
              <Grid className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-white text-[#0078D4] flex items-center justify-center shadow-xs font-bold">
                <Mail className="w-4 h-4 fill-[#0078D4] text-white" />
              </div>
              <span className="text-base font-bold tracking-tight text-white">Outlook</span>
              <span className="text-[11px] bg-white/20 text-white font-medium px-2 py-0.5 rounded-full">
                AB Company AP Gateway
              </span>
            </div>
          </div>

          {/* Center: Outlook Search Box */}
          <div className="flex-1 max-w-xl mx-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mail, resource managers, and purchase orders (Ctrl+E)"
                className="w-full bg-white text-slate-900 placeholder:text-slate-500 text-xs rounded-lg pl-9 pr-8 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-300 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right: Quick Tools & Outlook Avatar */}
          <div className="flex items-center gap-2 shrink-0">
            {onTriggerDailyReminders && (
              <button 
                onClick={onTriggerDailyReminders}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-[#106ebe] hover:bg-[#005a9e] text-white rounded-md transition-colors border border-blue-400/40 cursor-pointer"
                title="Trigger automated morning reminder digest to all resource managers"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Daily Digest</span>
              </button>
            )}

            {onOpenSendReminder && (
              <button 
                onClick={onOpenSendReminder}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-white text-[#0078D4] hover:bg-blue-50 rounded-md transition-colors shadow-2xs font-bold cursor-pointer"
                title="Compose custom reminder / nudge to managers or vendors"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Nudge Manager</span>
              </button>
            )}

            <div className="h-5 w-[1px] bg-blue-400/40 mx-1 hidden sm:block"></div>

            <div className="w-8 h-8 rounded-full bg-[#107C41] text-white text-xs font-bold flex items-center justify-center ring-2 ring-white/40 shadow-xs">
              LJ
            </div>
          </div>
        </header>

        {/* 2. Outlook Command Bar / Ribbon (White Toolbar) */}
        <div className="bg-[#f3f2f1] border-b border-slate-200 px-4 py-1.5 flex items-center justify-between gap-3 overflow-x-auto select-none">
          <div className="flex items-center gap-1.5 text-xs text-slate-700">
            {/* New Mail Pill */}
            {onOpenSendReminder && (
              <button 
                onClick={onOpenSendReminder}
                className="px-3.5 py-1.5 bg-[#0078D4] hover:bg-[#106ebe] text-white font-semibold rounded-md shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer text-xs mr-2"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>New mail</span>
                <ChevronDown className="w-3 h-3 text-blue-200" />
              </button>
            )}

            {/* Outlook Action Buttons */}
            <button 
              className="px-2.5 py-1.5 hover:bg-slate-200 rounded transition-colors inline-flex items-center gap-1 text-slate-700 text-xs cursor-pointer"
              title="Delete selected notification"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Delete</span>
            </button>

            <button 
              className="px-2.5 py-1.5 hover:bg-slate-200 rounded transition-colors inline-flex items-center gap-1 text-slate-700 text-xs cursor-pointer"
              title="Archive notification"
            >
              <Archive className="w-3.5 h-3.5 text-slate-500" />
              <span>Archive</span>
            </button>

            <button 
              onClick={() => {
                if (selectedEmail) onMarkAsRead(selectedEmail.id);
              }}
              className="px-2.5 py-1.5 hover:bg-slate-200 rounded transition-colors inline-flex items-center gap-1 text-slate-700 text-xs cursor-pointer"
              title="Mark as read"
            >
              <CheckSquare className="w-3.5 h-3.5 text-slate-500" />
              <span>Mark as read</span>
            </button>

            <div className="h-4 w-[1px] bg-slate-300 mx-1"></div>

            {/* Quick Supplier Filter */}
            <div className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs">
              <Filter className="w-3 h-3 text-slate-400" />
              <span className="text-[11px] font-medium text-slate-500">Supplier:</span>
              <select
                value={selectedVendorFilter}
                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                className="bg-transparent text-slate-800 text-[11px] font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Suppliers</option>
                <option value="Apex Global Solutions">Apex Global</option>
                <option value="TechCorp Solutions">TechCorp</option>
                <option value="GlobalLogic Partners">GlobalLogic</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="text-[11px] font-mono">
              Total {notifications.length} alerts • {unreadCount} unread
            </span>
          </div>
        </div>

        {/* 3. Three-Pane Mailbox Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px] bg-white">
          
          {/* Pane 1: Left Navigation / Folders Pane (Col span 2) */}
          <div className="lg:col-span-2 border-r border-slate-200 bg-[#f8f9fa] p-3 space-y-4 flex flex-col justify-between select-none">
            <div className="space-y-3">
              {/* Favorites Header */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 block mb-1">
                  Favorites
                </span>
                <nav className="space-y-0.5 text-xs">
                  <button
                    onClick={() => setSelectedFolder('INBOX')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                      selectedFolder === 'INBOX' 
                        ? 'bg-[#edebe9] text-[#0078D4]' 
                        : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Inbox className="w-4 h-4 text-[#0078D4]" />
                      <span>Inbox</span>
                    </div>
                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedFolder === 'INBOX' ? 'bg-[#0078D4] text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {notifications.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setSelectedFolder('APPROVALS')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                      selectedFolder === 'APPROVALS' 
                        ? 'bg-[#edebe9] text-purple-800' 
                        : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-purple-600" />
                      <span>Approvals</span>
                    </div>
                    <span className="text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-purple-100 text-purple-800">
                      {approvalsCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setSelectedFolder('CLEARANCE')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                      selectedFolder === 'CLEARANCE' 
                        ? 'bg-[#edebe9] text-emerald-800' 
                        : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-600" />
                      <span>PICC Cleared</span>
                    </div>
                    <span className="text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-100 text-emerald-800">
                      {clearanceCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setSelectedFolder('REMINDERS')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                      selectedFolder === 'REMINDERS' 
                        ? 'bg-[#edebe9] text-amber-800' 
                        : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BellRing className="w-4 h-4 text-amber-600" />
                      <span>Nudges</span>
                    </div>
                    <span className="text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-amber-100 text-amber-800">
                      {remindersCount}
                    </span>
                  </button>
                </nav>
              </div>

              {/* Standard Folders Tree */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 block mb-1">
                  Folders
                </span>
                <nav className="space-y-0.5 text-xs text-slate-700">
                  <button 
                    onClick={() => setSelectedFolder('SENT')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      selectedFolder === 'SENT' ? 'bg-[#edebe9] text-[#0078D4]' : 'hover:bg-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Send className="w-3.5 h-3.5 text-slate-500" />
                      <span>Sent Items</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">14</span>
                  </button>

                  <button 
                    onClick={() => setSelectedFolder('ARCHIVE')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      selectedFolder === 'ARCHIVE' ? 'bg-[#edebe9] text-[#0078D4]' : 'hover:bg-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Archive className="w-3.5 h-3.5 text-slate-500" />
                      <span>Archive</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => setSelectedFolder('DELETED')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      selectedFolder === 'DELETED' ? 'bg-[#edebe9] text-[#0078D4]' : 'hover:bg-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Deleted Items</span>
                    </div>
                  </button>
                </nav>
              </div>

              {/* Categories & Vendors */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 block mb-1">
                  Vendors
                </span>
                <div className="space-y-1 text-[11px]">
                  <div 
                    onClick={() => setSelectedVendorFilter(selectedVendorFilter.includes('Apex') ? 'ALL' : 'Apex')}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded cursor-pointer transition-colors ${
                      selectedVendorFilter.includes('Apex') ? 'bg-blue-100 font-bold text-blue-900' : 'text-slate-600 hover:bg-slate-200/50'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-[#0078D4]"></div>
                    <span className="truncate">Apex Global Solutions</span>
                  </div>
                  <div 
                    onClick={() => setSelectedVendorFilter(selectedVendorFilter.includes('TechCorp') ? 'ALL' : 'TechCorp')}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded cursor-pointer transition-colors ${
                      selectedVendorFilter.includes('TechCorp') ? 'bg-indigo-100 font-bold text-indigo-900' : 'text-slate-600 hover:bg-slate-200/50'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                    <span className="truncate">TechCorp Systems</span>
                  </div>
                  <div 
                    onClick={() => setSelectedVendorFilter(selectedVendorFilter.includes('GlobalLogic') ? 'ALL' : 'GlobalLogic')}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded cursor-pointer transition-colors ${
                      selectedVendorFilter.includes('GlobalLogic') ? 'bg-emerald-100 font-bold text-emerald-900' : 'text-slate-600 hover:bg-slate-200/50'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
                    <span className="truncate">GlobalLogic Partners</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Left Footer: Outlook Connected Status */}
            <div className="pt-3 border-t border-slate-200 text-[10px] text-slate-500 space-y-1">
              <div className="flex items-center gap-1 text-emerald-700 font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Connected to Exchange</span>
              </div>
              <div className="text-slate-400 font-mono text-[9px]">
                smtp.abcompany.internal
              </div>
            </div>
          </div>

          {/* Pane 2: Middle Message List Pane (Col span 4) */}
          <div className="lg:col-span-4 border-r border-slate-200 flex flex-col bg-white overflow-hidden">
            
            {/* Outlook "Focused" and "Other" Tabs */}
            <div className="border-b border-slate-200 px-4 pt-2.5 flex items-center justify-between select-none bg-white">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMailboxTab('FOCUSED')}
                  className={`pb-2 text-xs font-bold transition-all relative cursor-pointer ${
                    mailboxTab === 'FOCUSED'
                      ? 'text-[#0078D4]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Focused</span>
                  {mailboxTab === 'FOCUSED' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0078D4] rounded-t-full"></span>
                  )}
                </button>

                <button
                  onClick={() => setMailboxTab('OTHER')}
                  className={`pb-2 text-xs font-bold transition-all relative cursor-pointer ${
                    mailboxTab === 'OTHER'
                      ? 'text-[#0078D4]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Other</span>
                  {mailboxTab === 'OTHER' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0078D4] rounded-t-full"></span>
                  )}
                </button>
              </div>

              <div className="pb-2 text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                <SlidersHorizontal className="w-3 h-3" />
                <span>Filter</span>
              </div>
            </div>

            {/* Message List Items */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[600px]">
              {filteredEmails.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs">
                  <Inbox className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-600">All caught up!</p>
                  <p className="text-[11px] text-slate-400 mt-1">No alerts found matching your current folder or search filter.</p>
                </div>
              ) : (
                filteredEmails.map((email) => {
                  const isSelected = selectedEmail?.id === email.id;
                  const isFlagged = flaggedIds.has(email.id);
                  const avatarColor = getAvatarColor(email.toName || email.fromName || 'AB');
                  const initials = getInitials(email.toName || email.fromName);

                  return (
                    <div
                      key={email.id}
                      onClick={() => {
                        setSelectedEmailId(email.id);
                        onMarkAsRead(email.id);
                      }}
                      className={`group p-3 cursor-pointer transition-colors relative border-l-[3.5px] ${
                        isSelected
                          ? 'bg-[#e5f1fb] border-l-[#0078D4]'
                          : 'hover:bg-[#f3f2f1] border-l-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Outlook Circular Sender Avatar */}
                        <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs`}>
                          {initials}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Row 1: Sender Name & Date */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">
                              {email.toName || 'Resource Manager'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {new Date(email.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {/* Row 2: Subject */}
                          <div className="text-xs font-semibold text-slate-800 truncate mt-0.5 leading-snug">
                            {email.subject}
                          </div>

                          {/* Row 3: 2-Line Preview Snippet */}
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-tight">
                            {email.isReminder && email.reminderMessage ? email.reminderMessage : email.previewText}
                          </p>

                          {/* Row 4: Outlook Tags & Badges */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px]">
                            {email.isClearanceNotification ? (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                                <Award className="w-2.5 h-2.5 text-emerald-600" />
                                <span>PICC CLEARED</span>
                              </span>
                            ) : email.isReminder ? (
                              <span className={`px-1.5 py-0.2 rounded font-bold flex items-center gap-1 ${
                                email.urgency === 'CRITICAL'
                                  ? 'bg-rose-100 text-rose-800'
                                  : email.urgency === 'URGENT'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                <BellRing className="w-2.5 h-2.5" />
                                <span>{email.urgency || 'NUDGE'}</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold">
                                APPROVAL REQUIRED
                              </span>
                            )}

                            <span className="font-mono text-slate-500 bg-slate-100 px-1 rounded">
                              {email.poNumber}
                            </span>

                            {email.discrepanciesCount !== undefined && email.discrepanciesCount > 0 && (
                              <span className="font-bold text-red-600">
                                {email.discrepanciesCount} Discrepancies
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Flag Button */}
                        <button
                          onClick={(e) => toggleFlag(email.id, e)}
                          className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 transition-opacity cursor-pointer ${
                            isFlagged ? '!opacity-100 text-amber-500' : 'text-slate-400'
                          }`}
                          title={isFlagged ? 'Unflag message' : 'Flag message'}
                        >
                          <Flag className={`w-3.5 h-3.5 ${isFlagged ? 'fill-amber-500' : ''}`} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pane 3: Right Reading Pane (Col span 6) */}
          <div className="lg:col-span-6 flex flex-col bg-white overflow-hidden">
            {selectedEmail ? (
              <div className="flex flex-col h-full overflow-hidden">
                
                {/* Outlook Action Bar (Reply, Reply All, Forward, PICC, Audit) */}
                <div className="bg-[#f8f9fa] border-b border-slate-200 px-5 py-2 flex items-center justify-between gap-3 select-none">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => onNavigateToManager(selectedEmail.toEmail)}
                      className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-700 rounded transition-colors inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                      title="Reply & Open in Manager Review Desk"
                    >
                      <Reply className="w-3.5 h-3.5 text-slate-600" />
                      <span>Reply</span>
                    </button>

                    <button 
                      onClick={() => onNavigateToManager(selectedEmail.toEmail)}
                      className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-700 rounded transition-colors inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                      title="Reply All to Stakeholders"
                    >
                      <ReplyAll className="w-3.5 h-3.5 text-slate-600" />
                      <span>Reply all</span>
                    </button>

                    <button 
                      onClick={() => handleCopyLink(getToolUrl(selectedEmail))}
                      className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-700 rounded transition-colors inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                      title="Forward direct deep-link"
                    >
                      <Forward className="w-3.5 h-3.5 text-slate-600" />
                      <span>Forward</span>
                    </button>

                    <div className="h-4 w-[1px] bg-slate-300 mx-1"></div>

                    {onOpenPdfReport && (
                      <button
                        onClick={() => onOpenPdfReport(selectedEmail.batchId)}
                        className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-700 rounded transition-colors inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title="Print / Export PDF Audit Report"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-600" />
                        <span>Print Report</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyLink(getToolUrl(selectedEmail))}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium inline-flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                      title="Copy direct deep-link URL"
                    >
                      {copiedUrl ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-bold text-[11px]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span className="text-[11px]">Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Email Header Info (Outlook Style) */}
                <div className="px-6 py-4 border-b border-slate-100 bg-white">
                  {/* Subject Headline */}
                  <h1 className="text-lg font-bold text-slate-900 leading-snug tracking-tight">
                    {selectedEmail.subject}
                  </h1>

                  {/* Sender Details with Outlook Contact Card Styling */}
                  <div className="flex items-start gap-3 mt-3">
                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(selectedEmail.toName || 'AB')} flex items-center justify-center text-sm font-bold shadow-xs text-white`}>
                      {getInitials(selectedEmail.toName)}
                    </div>

                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {selectedEmail.fromName || 'AB Company Central Invoicing Automation'}
                          </span>
                          <span className="text-slate-400 font-normal">
                            &lt;{selectedEmail.fromEmail || 'no-reply-ariba@abcompany.com'}&gt;
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(selectedEmail.sentAt).toLocaleString([], { 
                            weekday: 'short', 
                            month: 'numeric', 
                            day: 'numeric', 
                            year: 'numeric',
                            hour: 'numeric', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>

                      <div className="text-slate-600 mt-0.5">
                        <span className="text-slate-400">To: </span>
                        <span className="font-semibold text-slate-800">{selectedEmail.toName}</span>
                        <span className="text-slate-500"> &lt;{selectedEmail.toEmail}&gt;</span>
                      </div>
                    </div>
                  </div>

                  {/* Outlook Attachment Card (Excel or PDF) */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Attachments (1)
                    </span>
                    <div className="inline-flex items-center gap-3 p-2 bg-[#f8f9fa] border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-2xs">
                      {selectedEmail.isClearanceNotification ? (
                        <FileCheck className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                      )}
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          {selectedEmail.isClearanceNotification 
                            ? `PICC_Clearance_${selectedEmail.clearanceCertificateId || 'CERT'}.xlsx`
                            : `PO_Reconciliation_Variance_${selectedEmail.poNumber}.xlsx`}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          48.2 KB • Microsoft Excel Worksheet
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                        {onOpenPdfReport && (
                          <button 
                            onClick={() => onOpenPdfReport(selectedEmail.batchId)}
                            className="px-2 py-1 text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                          >
                            Preview
                          </button>
                        )}
                        {onOpenClearanceCertificate && (
                          <button 
                            onClick={() => onOpenClearanceCertificate(selectedEmail.batchId)}
                            className="px-2 py-1 text-[11px] font-semibold text-[#0078D4] hover:underline cursor-pointer"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email Body Template (Corporate Microsoft Segoe UI Flow) */}
                <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-800 space-y-5 bg-white">
                  
                  {/* Status Banner */}
                  {selectedEmail.isClearanceNotification ? (
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-950 flex items-start gap-3 shadow-2xs">
                      <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Award className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-xs uppercase tracking-wider text-emerald-900">
                            Pre-Invoice Clearance Certificate (PICC) Ready
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono font-bold border border-emerald-200">
                            {selectedEmail.clearanceCertificateId || 'AB-PICC-2026'}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800 leading-relaxed mt-1">
                          100% managerial sign-off achieved. Pre-invoice clearance code generated for touchless Ariba 3-way matching.
                        </p>
                      </div>
                    </div>
                  ) : selectedEmail.isReminder ? (
                    <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-2xs ${
                      selectedEmail.urgency === 'CRITICAL'
                        ? 'bg-rose-50 border-rose-200 text-rose-950'
                        : selectedEmail.urgency === 'URGENT'
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-blue-50 border-blue-200 text-blue-950'
                    }`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-xs text-white ${
                        selectedEmail.urgency === 'CRITICAL'
                          ? 'bg-rose-600'
                          : selectedEmail.urgency === 'URGENT'
                          ? 'bg-amber-600'
                          : 'bg-blue-600'
                      }`}>
                        <BellRing className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-xs uppercase tracking-wider">
                            ACTION REQUIRED: APPROVAL SLA EXPIRING
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/80 border border-current">
                            {selectedEmail.urgency || 'REMINDER'}
                          </span>
                        </div>
                        <p className="text-[11px] mt-1 leading-relaxed opacity-90">
                          {selectedEmail.reminderMessage || 'Resource managers are requested to sign off on pending timesheet days to prevent vendor invoice rejection in SAP Ariba.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/70 text-purple-950 flex items-start gap-3 shadow-2xs">
                      <div className="w-9 h-9 rounded-lg bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs uppercase tracking-wider text-purple-900 block">
                          ACTION REQUIRED: INVOICE VARIANCE REVIEW
                        </span>
                        <p className="text-[11px] text-purple-800 leading-relaxed mt-1">
                          A supplier has submitted invoice data for Purchase Order <strong className="font-mono">{selectedEmail.poNumber}</strong> with {selectedEmail.discrepanciesCount || 1} discrepancies requiring your managerial decision.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Body Salutation & Narrative */}
                  <div className="space-y-2">
                    <p className="font-bold text-slate-900">Dear {selectedEmail.toName},</p>
                    <p className="text-slate-700 leading-relaxed">
                      {selectedEmail.contentBody ? (
                        <span className="whitespace-pre-line">{selectedEmail.contentBody}</span>
                      ) : (
                        <>
                          The pre-invoice reconciliation workflow for Purchase Order <strong className="font-mono text-slate-900">{selectedEmail.poNumber}</strong> (Billing Month: <strong>{selectedEmail.billingMonth || '2026-08'}</strong>) from vendor <strong className="text-slate-900">{selectedEmail.vendorName || 'Apex Global Solutions'}</strong> is pending your review.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Financial Metrics Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Billed</span>
                      <span className="text-sm font-bold text-slate-900 font-mono block mt-0.5">
                        {formatCurrency(selectedEmail.financialImpact || 0, selectedEmail.currency)}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Discrepancies</span>
                      <span className="text-sm font-bold text-red-600 font-mono block mt-0.5">
                        {selectedEmail.discrepanciesCount || 0} Lines
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Billing Month</span>
                      <span className="text-sm font-bold text-slate-800 font-mono block mt-0.5">
                        {selectedEmail.billingMonth || '2026-08'}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">PO Reference</span>
                      <span className="text-sm font-bold text-[#0078D4] font-mono block mt-0.5 truncate">
                        {selectedEmail.poNumber}
                      </span>
                    </div>
                  </div>

                  {/* Detailed Discrepancy Table */}
                  {selectedEmail.discrepancyItems && selectedEmail.discrepancyItems.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 font-bold text-xs text-slate-800">
                        Pending Line Items & Variance Breakdown
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100/70 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3">Resource</th>
                              <th className="py-2 px-3">AB Days</th>
                              <th className="py-2 px-3">Billed</th>
                              <th className="py-2 px-3">Variance</th>
                              <th className="py-2 px-3">Rate</th>
                              <th className="py-2 px-3 text-right">Exposure</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedEmail.discrepancyItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3">
                                  <div className="font-bold text-slate-800">{item.resourceName}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{item.resourceEmail}</div>
                                </td>
                                <td className="py-2 px-3 font-mono">{item.internalApprovedDays} d</td>
                                <td className="py-2 px-3 font-mono">{item.billedDays} d</td>
                                <td className="py-2 px-3 font-mono font-bold text-red-600">
                                  {item.daysVariance > 0 ? `+${item.daysVariance} d` : `${item.daysVariance} d`}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-600">
                                  {formatCurrency(item.contractDailyRate, selectedEmail.currency)}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-red-600 text-right">
                                  {formatCurrency(item.financialVarianceAmount, selectedEmail.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Primary CTA in Email Body */}
                  <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-slate-500 text-[11px] leading-relaxed">
                      AB Company Accounts Payable & Invoicing Automation Service<br />
                      Corporate Procurement Governance Desk
                    </div>

                    <button
                      onClick={() => onNavigateToManager(selectedEmail.toEmail)}
                      className="px-5 py-2.5 bg-[#0078D4] hover:bg-[#106ebe] text-white rounded-lg font-bold text-xs shadow-sm transition-colors inline-flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      <span>Open Review Desk</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center h-full">
                <Mail className="w-12 h-12 text-slate-300 mb-2" />
                <span className="font-bold text-slate-600 text-sm">Select an email to read</span>
                <span className="text-[11px] text-slate-400 mt-1">Nothing is selected in your Outlook reading pane.</span>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
