import React, { useState, useRef } from 'react';
import { 
  Search, 
  Plus, 
  Key, 
  Clock, 
  CheckCircle2, 
  Building2,
  RefreshCw,
  UploadCloud,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  MapPin,
  Briefcase,
  Layers
} from 'lucide-react';
import { InternalTimesheet, Currency, UserProfile } from '../types';
import { formatCurrency } from '../utils/reconciliationEngine';
import { parseTimesheetFile, downloadTimesheetDatabaseTemplate } from '../utils/excelHelper';

interface TimesheetDatabaseViewProps {
  timesheets: InternalTimesheet[];
  currentCurrency: Currency;
  onAddTimesheet: (newTs: InternalTimesheet) => void;
  onBulkImportTimesheets?: (imported: InternalTimesheet[]) => void;
  currentUser: UserProfile;
  onResyncWithTimesheets?: () => void;
}

export const TimesheetDatabaseView: React.FC<TimesheetDatabaseViewProps> = ({
  timesheets,
  currentCurrency,
  onAddTimesheet,
  onBulkImportTimesheets,
  currentUser,
  onResyncWithTimesheets
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPo, setSelectedPo] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state for adding new timesheet
  const [newEmail, setNewEmail] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newPo, setNewPo] = useState<string>('PO-AB-2026-8941');
  const [newPoLineItem, setNewPoLineItem] = useState<string>('00010');
  const [newAdmSeniority, setNewAdmSeniority] = useState<string>('Senior Consultant');
  const [newAdmRole, setNewAdmRole] = useState<string>('Cloud Solutions Architect');
  const [newLocationCity, setNewLocationCity] = useState<string>('Chicago');
  const [newVendor, setNewVendor] = useState<string>('Apex Global Solutions');
  const [newDays, setNewDays] = useState<number>(20);
  const [newRate, setNewRate] = useState<number>(850);
  const [newMonth, setNewMonth] = useState<string>('2026-08');
  const [newProject, setNewProject] = useState<string>('Kubernetes Multi-Region');
  const [newManagerEmail, setNewManagerEmail] = useState<string>('sarah.jenkins@abcompany.com');
  const [newManagerName, setNewManagerName] = useState<string>('Sarah Jenkins');

  const filteredTimesheets = timesheets.filter(ts => {
    const matchesSearch = 
      ts.resourceEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ts.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ts.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ts.poLineItem && ts.poLineItem.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ts.admSeniority && ts.admSeniority.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ts.admRole && ts.admRole.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ts.locationCity && ts.locationCity.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ts.managerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ts.projectCode.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPo = selectedPo === 'all' || ts.poNumber === selectedPo;
    return matchesSearch && matchesPo;
  });

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      setStatusMessage(null);
      const parsed = await parseTimesheetFile(file, currentCurrency);
      if (onBulkImportTimesheets) {
        onBulkImportTimesheets(parsed);
      } else {
        parsed.forEach(ts => onAddTimesheet(ts));
      }
      setStatusMessage({
        type: 'success',
        text: `Successfully imported ${parsed.length} timesheet records from "${file.name}"! Central database and invoice batches refreshed.`
      });
      setTimeout(() => setStatusMessage(null), 8000);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to parse timesheet file. Please verify columns and file format.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateTimesheet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) {
      alert('Email and Name are required.');
      return;
    }

    const newRecord: InternalTimesheet = {
      id: `TS-${Date.now().toString(36).toUpperCase()}`,
      resourceEmail: newEmail.trim().toLowerCase(),
      resourceName: newName.trim(),
      poNumber: newPo,
      poLineItem: newPoLineItem.trim() || '00010',
      admSeniority: newAdmSeniority.trim() || 'Senior Consultant',
      admRole: newAdmRole.trim() || 'Cloud Solutions Architect',
      locationCity: newLocationCity.trim() || 'Chicago',
      vendorName: newVendor,
      billingMonth: newMonth,
      approvedDays: Number(newDays) || 0,
      approvedHours: (Number(newDays) || 0) * 8,
      contractDailyRate: Number(newRate) || 0,
      currency: currentCurrency,
      projectCode: `PRJ-${newPo.slice(-4)}`,
      projectName: newProject,
      department: 'Cloud & Engineering Platforms',
      managerEmail: newManagerEmail,
      managerName: newManagerName,
      status: 'Approved',
      lastLoggedDate: new Date().toISOString().split('T')[0]
    };

    onAddTimesheet(newRecord);
    setShowAddModal(false);
    setStatusMessage({
      type: 'success',
      text: `Added timesheet record for ${newRecord.resourceName} (${newRecord.resourceEmail}) with ${newRecord.approvedDays} approved days. Active batches re-synced.`
    });
    setTimeout(() => setStatusMessage(null), 6000);
    // Reset
    setNewEmail('');
    setNewName('');
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Bulk Timesheet Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />
      
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full font-bold border border-blue-100 uppercase">
                Central Master Database
              </span>
              <span className="text-xs text-slate-500 font-mono">
                AB Company Internal Timesheets
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-1">
              Internal Timesheet Database Records
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Source of truth for all resource billing validation. Every vendor invoice line is matched against this central ledger using <span className="font-semibold text-slate-700">Resource Email ID & PO Number</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="timesheet-download-template-btn"
              onClick={() => downloadTimesheetDatabaseTemplate(selectedPo !== 'all' ? selectedPo : 'PO-AB-2026-8941', currentCurrency)}
              className="text-xs px-3.5 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="Download Timesheet Excel template with all required columns"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Timesheet Template</span>
            </button>

            <button
              id="timesheet-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 px-3.5 py-2 rounded-lg text-xs font-medium shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Upload / Re-Upload Timesheets from Excel or CSV file"
            >
              <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isProcessing ? 'Processing File...' : 'Upload / Re-Upload Timesheets'}</span>
            </button>

            {onResyncWithTimesheets && (
              <button
                id="timesheet-resync-batches-btn"
                onClick={onResyncWithTimesheets}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-medium shadow-xs transition-colors inline-flex items-center gap-1.5"
                title="Retroactive Timesheet Diff: Re-verify all invoice batches against updated timesheet hours"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-Sync Batches with DB</span>
              </button>
            )}

            <button
              id="timesheet-add-entry-btn"
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium shadow-xs transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>Add Timesheet Entry</span>
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
        )}

        {/* Database Search & Filters */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Email ID, Name, PO, Role, Seniority, City..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">Filter PO:</label>
            <select
              value={selectedPo}
              onChange={(e) => setSelectedPo(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
            >
              <option value="all">All Purchase Orders</option>
              <option value="PO-AB-2026-8941">PO-AB-2026-8941 (Apex)</option>
              <option value="PO-AB-2026-7203">PO-AB-2026-7203 (Synapse)</option>
              <option value="PO-AB-2026-6119">PO-AB-2026-6119 (CloudBridge)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Database Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Common Key (Email ID) & Name</th>
                <th className="px-5 py-3.5">PO & Line Item</th>
                <th className="px-5 py-3.5">Seniority & Role</th>
                <th className="px-5 py-3.5">Location (City)</th>
                <th className="px-5 py-3.5">Approved Days (Hours)</th>
                <th className="px-5 py-3.5">Contract Rate / Day</th>
                <th className="px-5 py-3.5">Total Value</th>
                <th className="px-5 py-3.5">Approving Manager</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {filteredTimesheets.map((ts) => (
                <tr key={ts.id} className="hover:bg-slate-50/80 transition-colors">
                  
                  {/* Email & Name */}
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-slate-900">{ts.resourceName}</div>
                    <div className="font-mono text-xs text-blue-600 flex items-center gap-1 font-medium">
                      <Key className="w-3 h-3 text-blue-500 shrink-0" />
                      <span>{ts.resourceEmail}</span>
                    </div>
                  </td>

                  {/* PO & Line Item */}
                  <td className="px-5 py-3.5">
                    <div className="font-mono font-medium text-slate-800 text-xs">{ts.poNumber}</div>
                    <div className="text-[11px] text-indigo-700 font-mono font-semibold flex items-center gap-1 mt-0.5">
                      <Layers className="w-3 h-3 text-indigo-500" />
                      <span>Line: {ts.poLineItem || '00010'}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">{ts.vendorName}</div>
                  </td>

                  {/* Seniority & Role */}
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                      <Briefcase className="w-3 h-3 text-slate-400" />
                      <span>{ts.admRole || 'Cloud Consultant'}</span>
                    </div>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-medium rounded-full">
                      {ts.admSeniority || 'Senior'}
                    </span>
                  </td>

                  {/* Location City */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 text-slate-700 text-xs font-medium">
                      <MapPin className="w-3 h-3 text-red-500" />
                      <span>{ts.locationCity || 'Chicago'}</span>
                    </div>
                  </td>

                  {/* Approved Days */}
                  <td className="px-5 py-3.5">
                    <div className="font-bold text-slate-900">{ts.approvedDays} Days</div>
                    <div className="text-[11px] text-slate-500">{ts.approvedHours || ts.approvedDays * 8} Hours (8h/d)</div>
                  </td>

                  {/* Contract Rate */}
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-slate-800">
                      {formatCurrency(ts.contractDailyRate, currentCurrency)}/day
                    </div>
                    <div className="text-[10px] text-slate-400">Fixed Rate</div>
                  </td>

                  {/* Total Value */}
                  <td className="px-5 py-3.5">
                    <div className="font-bold text-slate-900">
                      {formatCurrency(ts.approvedDays * ts.contractDailyRate, currentCurrency)}
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded-full font-bold border border-emerald-100 uppercase">
                      {ts.status}
                    </span>
                  </td>

                  {/* Manager */}
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-slate-800 text-xs">{ts.managerName}</div>
                    <div className="text-[11px] text-slate-500">{ts.department}</div>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Timesheet Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Add Central Internal Timesheet Record
                </h3>
                <p className="text-xs text-slate-500">
                  Enter approved consultant timesheet hours directly into the corporate master ledger.
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreateTimesheet} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Resource Email ID *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. unmapped.contractor@apexconsulting.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Resource Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Darren Hayes"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Purchase Order Number</label>
                  <select
                    value={newPo}
                    onChange={(e) => {
                      setNewPo(e.target.value);
                      if (e.target.value.includes('8941')) setNewVendor('Apex Global Solutions');
                      if (e.target.value.includes('7203')) setNewVendor('Synapse Digital Partners');
                      if (e.target.value.includes('6119')) setNewVendor('CloudBridge Infotech');
                    }}
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900"
                  >
                    <option value="PO-AB-2026-8941">PO-AB-2026-8941 (Apex)</option>
                    <option value="PO-AB-2026-7203">PO-AB-2026-7203 (Synapse)</option>
                    <option value="PO-AB-2026-6119">PO-AB-2026-6119 (CloudBridge)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">PO Line Item</label>
                  <input
                    type="text"
                    value={newPoLineItem}
                    onChange={(e) => setNewPoLineItem(e.target.value)}
                    placeholder="e.g. 00060"
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">ADM Seniority</label>
                  <input
                    type="text"
                    value={newAdmSeniority}
                    onChange={(e) => setNewAdmSeniority(e.target.value)}
                    placeholder="e.g. Lead Consultant"
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">ADM Role</label>
                  <input
                    type="text"
                    value={newAdmRole}
                    onChange={(e) => setNewAdmRole(e.target.value)}
                    placeholder="e.g. Cloud Security Architect"
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Resource Location (City)</label>
                  <input
                    type="text"
                    value={newLocationCity}
                    onChange={(e) => setNewLocationCity(e.target.value)}
                    placeholder="e.g. Chicago"
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Billing Month</label>
                  <input
                    type="text"
                    value={newMonth}
                    onChange={(e) => setNewMonth(e.target.value)}
                    placeholder="2026-08"
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Approved Days</label>
                  <input
                    type="number"
                    value={newDays}
                    onChange={(e) => setNewDays(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Contract Daily Rate ($)</label>
                  <input
                    type="number"
                    value={newRate}
                    onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Assigned Resource Manager</label>
                <select
                  value={newManagerEmail}
                  onChange={(e) => {
                    setNewManagerEmail(e.target.value);
                    if (e.target.value.includes('sarah')) setNewManagerName('Sarah Jenkins');
                    if (e.target.value.includes('david')) setNewManagerName('David Chen');
                    if (e.target.value.includes('elena')) setNewManagerName('Elena Rostova');
                  }}
                  className="w-full border border-slate-200 rounded-lg p-2 text-slate-900"
                >
                  <option value="sarah.jenkins@abcompany.com">Sarah Jenkins (Cloud & Infrastructure Architecture)</option>
                  <option value="david.chen@abcompany.com">David Chen (Core Applications & Backend)</option>
                  <option value="elena.rostova@abcompany.com">Elena Rostova (Data & Machine Learning)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-xs"
                >
                  Save to Central DB & Re-Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
