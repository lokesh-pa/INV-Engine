import * as XLSX from 'xlsx';
import { VendorInvoiceRow, Currency, InternalTimesheet } from '../types';

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file into VendorInvoiceRow objects.
 */
export async function parseExcelFile(file: File, fallbackCurrency: Currency = 'USD'): Promise<VendorInvoiceRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  
  // Read first worksheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert sheet to JSON array of objects
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The uploaded file contains no data rows. Please ensure rows exist below the header row.');
  }

  const parsedRows: VendorInvoiceRow[] = [];

  rawRows.forEach((row, index) => {
    // Normalization helper for header keys
    const getVal = (...possibleKeys: string[]): any => {
      for (const key of possibleKeys) {
        // Exact match
        if (row[key] !== undefined && row[key] !== '') return row[key];
        // Case-insensitive / whitespace-stripped match
        const found = Object.keys(row).find(
          k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
        );
        if (found && row[found] !== undefined && row[found] !== '') return row[found];
      }
      return '';
    };

    const resourceEmail = String(getVal('Resource Email ID', 'Resource Email', 'Email ID', 'Email', 'ResourceEmail', 'Worker Email', 'Mail')).trim();
    if (!resourceEmail) {
      // Skip empty or comment rows
      return;
    }

    const resourceName = String(getVal('Resource Name', 'Name', 'ResourceName', 'Consultant Name', 'Worker Name')).trim();
    const poNumber = String(getVal('Purchase Order Number', 'Purchase Order', 'PO Number', 'PO', 'PONumber', 'PurchaseOrderNumber', 'PO #', 'Order Number')).trim();
    const poLineItem = String(getVal('PO Line Item', 'PO Line', 'Purchase Order Line Item', 'PO Line Item Number', 'PO Line #', 'POLineItem', 'Line Item #', 'Line Item', 'POLine', 'Line #')).trim();
    const admSeniority = String(getVal('ADM Seniority', 'Seniority', 'ADM Seniority Level', 'Seniority Level', 'Level')).trim();
    const admRole = String(getVal('ADM Role', 'Role', 'ADM Title', 'Designation', 'Job Title', 'Job Role', 'Title')).trim();
    const locationCity = String(getVal('Resource Location (City)', 'Resource Location', 'Location (City)', 'Location', 'City', 'Work City', 'Work Location')).trim();
    const billingMonth = String(getVal('Billing Month', 'Month', 'Period', 'BillingMonth', 'Cycle')).trim();
    
    let billedDays = parseFloat(String(getVal('Billed Days', 'Days', 'Total Days', 'BilledDays', 'Days Billed', 'Approved Days', 'Timesheet Days', 'Quantity'))) || 0;
    // Fallback if provided in hours
    if (billedDays === 0) {
      const hours = parseFloat(String(getVal('Billed Hours', 'Hours', 'Total Hours', 'Approved Hours'))) || 0;
      if (hours > 0) {
        billedDays = +(hours / 8).toFixed(2);
      }
    }

    const claimedDailyRate = parseFloat(String(getVal('Daily Rate', 'Claimed Daily Rate', 'Rate', 'Day Rate', 'Contract Rate', 'DailyRate', 'Billing Rate'))) || 0;
    const currencyStr = String(getVal('Currency', 'Local Currency')).toUpperCase();
    const currency: Currency = (['USD', 'EUR', 'GBP', 'INR', 'SGD'].includes(currencyStr) ? currencyStr : fallbackCurrency) as Currency;
    const lineItemDescription = String(getVal('Line Item Description', 'Description', 'Deliverable', 'Notes')).trim();

    parsedRows.push({
      id: `EXCEL-ROW-${index + 1}`,
      resourceEmail,
      resourceName: resourceName || resourceEmail.split('@')[0].replace('.', ' '),
      poNumber: poNumber || 'PO-AB-2026-8941',
      poLineItem: poLineItem || String((index + 1) * 10).padStart(5, '0'),
      admSeniority: admSeniority || 'Senior',
      admRole: admRole || 'Cloud Consultant',
      locationCity: locationCity || 'Chicago',
      billingMonth: billingMonth || '2026-08',
      billedDays,
      claimedDailyRate,
      currency,
      lineItemDescription: lineItemDescription || 'Software engineering and cloud delivery services'
    });
  });

  if (parsedRows.length === 0) {
    throw new Error('No valid resource records found. Please ensure the column "Resource Email ID" or "Email" is present.');
  }

  return parsedRows;
}

/**
 * Parses an internal timesheet Excel or CSV file into InternalTimesheet records.
 */
export async function parseTimesheetFile(file: File, fallbackCurrency: Currency = 'USD'): Promise<InternalTimesheet[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('Timesheet file contains no data rows.');
  }

  const timesheets: InternalTimesheet[] = [];

  rawRows.forEach((row, index) => {
    const getVal = (...possibleKeys: string[]): any => {
      for (const key of possibleKeys) {
        if (row[key] !== undefined && row[key] !== '') return row[key];
        const found = Object.keys(row).find(
          k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
        );
        if (found && row[found] !== undefined && row[found] !== '') return row[found];
      }
      return '';
    };

    const resourceEmail = String(getVal('Resource Email ID', 'Resource Email', 'Email ID', 'Email', 'ResourceEmail', 'Mail')).trim();
    if (!resourceEmail) return;

    const resourceName = String(getVal('Resource Name', 'Name', 'ResourceName', 'Consultant Name', 'Worker Name')).trim();
    const poNumber = String(getVal('Purchase Order Number', 'Purchase Order', 'PO Number', 'PO', 'PONumber', 'PurchaseOrderNumber', 'PO #')).trim() || 'PO-AB-2026-8941';
    const poLineItem = String(getVal('PO Line Item', 'PO Line', 'Purchase Order Line Item', 'PO Line Item Number', 'PO Line #', 'POLineItem')).trim() || String((index + 1) * 10).padStart(5, '0');
    const admSeniority = String(getVal('ADM Seniority', 'Seniority', 'ADM Seniority Level', 'Level')).trim() || 'Senior Consultant';
    const admRole = String(getVal('ADM Role', 'Role', 'ADM Title', 'Designation', 'Title')).trim() || 'Cloud Consultant';
    const locationCity = String(getVal('Resource Location (City)', 'Resource Location', 'Location (City)', 'Location', 'City')).trim() || 'Chicago';
    const vendorName = String(getVal('Vendor Name', 'Vendor', 'Supplier Name', 'Supplier')).trim() || 'Apex Global Solutions';
    const billingMonth = String(getVal('Billing Month', 'Month', 'Period', 'BillingMonth')).trim() || '2026-08';
    
    let approvedDays = parseFloat(String(getVal('Approved Days', 'Days', 'Total Days', 'Billed Days', 'Days Approved'))) || 0;
    let approvedHours = parseFloat(String(getVal('Approved Hours', 'Hours', 'Total Hours'))) || 0;
    if (approvedDays === 0 && approvedHours > 0) {
      approvedDays = +(approvedHours / 8).toFixed(2);
    } else if (approvedHours === 0 && approvedDays > 0) {
      approvedHours = approvedDays * 8;
    }

    const contractDailyRate = parseFloat(String(getVal('Contract Daily Rate', 'Daily Rate', 'Contract Rate', 'Rate', 'Day Rate'))) || 850;
    const currencyStr = String(getVal('Currency', 'Local Currency')).toUpperCase();
    const currency: Currency = (['USD', 'EUR', 'GBP', 'INR', 'SGD'].includes(currencyStr) ? currencyStr : fallbackCurrency) as Currency;
    const projectName = String(getVal('Project Name', 'Project', 'Engagement')).trim() || 'Cloud Engineering Services';
    const projectCode = String(getVal('Project Code', 'Code', 'Cost Center')).trim() || `PRJ-${poNumber.slice(-4)}`;
    const department = String(getVal('Department', 'Cost Center Name', 'Org')).trim() || 'Cloud & Infrastructure Architecture';
    const managerEmail = String(getVal('Manager Email', 'Approver Email', 'ManagerEmail')).trim() || 'sarah.jenkins@abcompany.com';
    const managerName = String(getVal('Manager Name', 'Approver Name', 'ManagerName')).trim() || 'Sarah Jenkins';
    const statusVal = String(getVal('Status', 'Approval Status')).trim();
    const status: 'Approved' | 'Submitted' | 'Draft' = (statusVal === 'Submitted' || statusVal === 'Draft') ? statusVal : 'Approved';

    timesheets.push({
      id: `TS-UP-${Date.now().toString(36).toUpperCase()}-${index + 1}`,
      resourceEmail: resourceEmail.toLowerCase(),
      resourceName: resourceName || resourceEmail.split('@')[0].replace('.', ' '),
      poNumber,
      poLineItem,
      admSeniority,
      admRole,
      locationCity,
      vendorName,
      billingMonth,
      approvedDays,
      approvedHours,
      contractDailyRate,
      currency,
      projectCode,
      projectName,
      department,
      managerEmail,
      managerName,
      status,
      lastLoggedDate: new Date().toISOString().split('T')[0]
    });
  });

  if (timesheets.length === 0) {
    throw new Error('No valid timesheet records found in uploaded file.');
  }

  return timesheets;
}

/**
 * Generates and triggers download of an official Timesheet Database Excel Template.
 */
export function downloadTimesheetDatabaseTemplate(poNumber: string = 'PO-AB-2026-8941', currency: Currency = 'USD') {
  const templateData = [
    {
      'Resource Email ID': 'alex.rivas@apexconsulting.com',
      'Resource Name': 'Alex Rivas',
      'Purchase Order Number': poNumber,
      'PO Line Item': '00010',
      'ADM Seniority': 'Lead Architect',
      'ADM Role': 'Cloud Solutions Architect',
      'Resource Location (City)': 'Chicago',
      'Vendor Name': 'Apex Global Solutions',
      'Billing Month': '2026-08',
      'Approved Days': 20,
      'Approved Hours': 160,
      'Contract Daily Rate': 850,
      'Currency': currency,
      'Project Code': 'PRJ-CLOUD-01',
      'Project Name': 'Kubernetes Multi-Region Orchestration',
      'Department': 'Cloud & Infrastructure Architecture',
      'Manager Email': 'sarah.jenkins@abcompany.com',
      'Manager Name': 'Sarah Jenkins',
      'Status': 'Approved'
    },
    {
      'Resource Email ID': 'priya.nair@apexconsulting.com',
      'Resource Name': 'Priya Nair',
      'Purchase Order Number': poNumber,
      'PO Line Item': '00020',
      'ADM Seniority': 'Senior Consultant',
      'ADM Role': 'Zero-Trust Security Engineer',
      'Resource Location (City)': 'San Francisco',
      'Vendor Name': 'Apex Global Solutions',
      'Billing Month': '2026-08',
      'Approved Days': 18,
      'Approved Hours': 144,
      'Contract Daily Rate': 920,
      'Currency': currency,
      'Project Code': 'PRJ-CLOUD-02',
      'Project Name': 'Zero-Trust IAM Architecture',
      'Department': 'Cloud & Infrastructure Architecture',
      'Manager Email': 'sarah.jenkins@abcompany.com',
      'Manager Name': 'Sarah Jenkins',
      'Status': 'Approved'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Internal Timesheet Master');
  XLSX.writeFile(workbook, `AB_Company_Central_Timesheet_Template_${poNumber}.xlsx`);
}

/**
 * Generates and triggers download of an official Excel Template for vendors.
 */
export function downloadVendorInvoiceTemplate(poNumber: string = 'PO-AB-2026-8941', currency: Currency = 'USD') {
  const templateData = [
    {
      'Purchase Order Number': poNumber,
      'PO Line Item': '00010',
      'Resource Email ID': 'alex.rivas@apexconsulting.com',
      'Resource Name': 'Alex Rivas',
      'ADM Seniority': 'Lead Architect',
      'ADM Role': 'Cloud Solutions Architect',
      'Resource Location (City)': 'Chicago',
      'Billing Month': '2026-08',
      'Billed Days': 20,
      'Daily Rate': 850,
      'Currency': currency,
      'Line Item Description': 'Kubernetes multi-region deployment'
    },
    {
      'Purchase Order Number': poNumber,
      'PO Line Item': '00020',
      'Resource Email ID': 'priya.nair@apexconsulting.com',
      'Resource Name': 'Priya Nair',
      'ADM Seniority': 'Senior Consultant',
      'ADM Role': 'Zero-Trust Security Engineer',
      'Resource Location (City)': 'San Francisco',
      'Billing Month': '2026-08',
      'Billed Days': 22,
      'Daily Rate': 920,
      'Currency': currency,
      'Line Item Description': 'Zero-Trust IAM integration sprint'
    },
    {
      'Purchase Order Number': poNumber,
      'PO Line Item': '00030',
      'Resource Email ID': 'marcus.foster@apexconsulting.com',
      'Resource Name': 'Marcus Foster',
      'ADM Seniority': 'Principal SRE',
      'ADM Role': 'DevOps & Platform Automation Lead',
      'Resource Location (City)': 'New York',
      'Billing Month': '2026-08',
      'Billed Days': 21,
      'Daily Rate': 780,
      'Currency': currency,
      'Line Item Description': 'Terraform infrastructure as code module testing'
    },
    {
      'Purchase Order Number': poNumber,
      'PO Line Item': '00040',
      'Resource Email ID': 'lucas.silva@apexconsulting.com',
      'Resource Name': 'Lucas Silva',
      'ADM Seniority': 'Staff Consultant',
      'ADM Role': 'Container Runtime Engineer',
      'Resource Location (City)': 'Austin',
      'Billing Month': '2026-08',
      'Billed Days': 15,
      'Daily Rate': 900,
      'Currency': currency,
      'Line Item Description': 'Container runtime optimization'
    },
    {
      'Purchase Order Number': poNumber,
      'PO Line Item': '00050',
      'Resource Email ID': 'ananya.iyer@apexconsulting.com',
      'Resource Name': 'Ananya Iyer',
      'ADM Seniority': 'Senior Specialist',
      'ADM Role': 'Cloud SecOps & Remediation Engineer',
      'Resource Location (City)': 'Seattle',
      'Billing Month': '2026-08',
      'Billed Days': 22,
      'Daily Rate': 880,
      'Currency': currency,
      'Line Item Description': 'Security vulnerability remediation'
    },
    {
      'Purchase Order Number': poNumber,
      'PO Line Item': '00060',
      'Resource Email ID': 'unmapped.contractor@apexconsulting.com',
      'Resource Name': 'Darren Hayes',
      'ADM Seniority': 'Lead Consultant',
      'ADM Role': 'Emergency Incident Response Engineer',
      'Resource Location (City)': 'London',
      'Billing Month': '2026-08',
      'Billed Days': 12,
      'Daily Rate': 850,
      'Currency': currency,
      'Line Item Description': 'Emergency incident response contractor'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);

  // Auto-width columns for neat presentation
  const colWidths = [
    { wch: 22 }, // Purchase Order Number
    { wch: 14 }, // PO Line Item
    { wch: 34 }, // Resource Email ID
    { wch: 18 }, // Resource Name
    { wch: 18 }, // ADM Seniority
    { wch: 28 }, // ADM Role
    { wch: 24 }, // Resource Location (City)
    { wch: 14 }, // Billing Month
    { wch: 12 }, // Billed Days
    { wch: 12 }, // Daily Rate
    { wch: 10 }, // Currency
    { wch: 42 }  // Line Item Description
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendor_Invoice_Data');

  // Trigger download
  XLSX.writeFile(workbook, `AB_Company_Vendor_Invoice_Template_${poNumber}.xlsx`);
}

/**
 * Exports reconciliation discrepancy results to Excel with multi-tab auditing
 */
export function exportReconciliationReportToExcel(
  items: any[], 
  poNumber: string, 
  batchInfo?: { 
    vendorName?: string; 
    billingMonth?: string; 
    totalBilledAmount?: number;
    totalInternalApprovedAmount?: number;
    netVarianceAmount?: number;
    status?: string;
    clearanceCertificate?: any;
  },
  auditLogs?: any[]
) {
  const wb = XLSX.utils.book_new();

  // 1. Executive Summary Sheet
  const totalItems = items.length;
  const matchedCount = items.filter(i => i.discrepancyType === 'PERFECT_MATCH').length;
  const discrepancyCount = items.filter(i => i.discrepancyType !== 'PERFECT_MATCH').length;
  const totalBilled = items.reduce((sum, i) => sum + (i.billedTotalAmount || 0), 0);
  const totalApproved = items.reduce((sum, i) => sum + (i.internalApprovedTotalAmount || 0), 0);
  const netVariance = items.reduce((sum, i) => sum + Math.max(0, i.financialVarianceAmount || 0), 0);
  const currency = items[0]?.currency || 'USD';

  const summaryData = [
    { 'Reconciliation Metric': 'Purchase Order Number', 'Value': poNumber },
    { 'Reconciliation Metric': 'Vendor Entity', 'Value': batchInfo?.vendorName || items[0]?.vendorName || 'Apex Global Solutions' },
    { 'Reconciliation Metric': 'Billing Month', 'Value': batchInfo?.billingMonth || items[0]?.billingMonth || '2026-08' },
    { 'Reconciliation Metric': 'Settlement Currency', 'Value': currency },
    { 'Reconciliation Metric': 'Overall Batch Status', 'Value': batchInfo?.status || 'RECONCILED' },
    { 'Reconciliation Metric': 'Total Line Items', 'Value': totalItems },
    { 'Reconciliation Metric': '100% Matched Lines', 'Value': matchedCount },
    { 'Reconciliation Metric': 'Flagged Discrepancies', 'Value': discrepancyCount },
    { 'Reconciliation Metric': 'Total Billed Amount', 'Value': totalBilled.toFixed(2) },
    { 'Reconciliation Metric': 'Internal Approved Amount', 'Value': totalApproved.toFixed(2) },
    { 'Reconciliation Metric': 'Net Variance Exposure', 'Value': netVariance.toFixed(2) },
    { 'Reconciliation Metric': 'Ariba Pre-Invoice Clearance Code', 'Value': batchInfo?.clearanceCertificate?.aribaSubmissionCode || 'PENDING_APPROVAL' },
    { 'Reconciliation Metric': 'Audit Hash Verification', 'Value': batchInfo?.clearanceCertificate?.verificationAuditHash || 'NOT_CLEARED' },
    { 'Reconciliation Metric': 'Report Generated At', 'Value': new Date().toISOString() }
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive_Summary');

  // 1b. Ariba Goods Receipt (GR) Line-Item Summary Sheet
  // (Used for goods receipt in Ariba when vendor submits actual invoice)
  const grData = items.map((item, idx) => {
    const finalDays = item.managerDecision 
      ? item.managerDecision.finalApprovedDays 
      : (item.internalApprovedDays ?? item.billedDays);
    const finalAmount = item.managerDecision 
      ? item.managerDecision.finalApprovedAmount 
      : +(finalDays * item.claimedDailyRate).toFixed(2);
    
    return {
      'PO Line Item': item.poLineItem || String((idx + 1) * 10).padStart(5, '0'),
      'Purchase Order Number': item.poNumber || poNumber,
      'Purchase Order': `${poNumber} (${item.vendorName || 'Vendor'})`,
      'Resource / Deliverable': item.resourceName,
      'Resource Email': item.resourceEmail,
      'ADM Seniority': item.admSeniority || 'Senior',
      'ADM Role': item.admRole || 'Cloud Specialist',
      'Resource Location (City)': item.locationCity || 'Chicago',
      'Project Code': item.projectCode || 'PRJ-CORE',
      'Unit of Measure (UOM)': 'DAY',
      'Total Number of Days per Line Item (Ariba GR)': finalDays,
      'Daily Contract Rate': item.claimedDailyRate,
      'Total Cleared Value': finalAmount,
      'Currency': item.currency || 'USD',
      'Original Claimed Days': item.billedDays,
      'Internal Timesheet Days': item.internalApprovedDays,
      'Ariba 3-Way Match Status': 'Ready for Goods Receipt / SES Posting',
      'Goods Receipt Purpose': 'Used for goods receipt in Ariba when vendor submits actual invoice'
    };
  });

  const wsGr = XLSX.utils.json_to_sheet(grData);
  wsGr['!cols'] = [
    { wch: 14 }, { wch: 22 }, { wch: 32 }, { wch: 24 }, { wch: 28 },
    { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 16 }, { wch: 10 },
    { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 28 }, { wch: 50 }
  ];
  XLSX.utils.book_append_sheet(wb, wsGr, 'Ariba_Goods_Receipt_GR');

  // 2. Full Reconciliation Ledger Sheet
  const exportData = items.map((item, idx) => ({
    'Discrepancy ID': item.id,
    'Purchase Order Number': item.poNumber || poNumber,
    'PO Line Item': item.poLineItem || String((idx + 1) * 10).padStart(5, '0'),
    'Resource Email ID': item.resourceEmail,
    'Resource Name': item.resourceName,
    'ADM Seniority': item.admSeniority || 'Senior',
    'ADM Role': item.admRole || 'Cloud Consultant',
    'Resource Location (City)': item.locationCity || 'Chicago',
    'Billing Month': item.billingMonth,
    'Billed Days': item.billedDays,
    'AB Approved Days': item.internalApprovedDays,
    'Days Variance': item.daysVariance,
    'Claimed Rate': item.claimedDailyRate,
    'Contract Rate': item.contractDailyRate,
    'Billed Total': item.billedTotalAmount,
    'Approved Total': item.internalApprovedTotalAmount,
    'Financial Variance': item.financialVarianceAmount,
    'Currency': item.currency,
    'Discrepancy Type': item.discrepancyType,
    'Severity': item.severity,
    'Review Manager': `${item.managerName} (${item.managerEmail})`,
    'Status': item.status,
    'Manager Decision': item.managerDecision ? item.managerDecision.action : 'Pending Review',
    'Decided By': item.managerDecision ? item.managerDecision.decidedByName : '',
    'Delegated By': item.managerDecision?.delegatedBy ? item.managerDecision.delegatedBy.delegatorName : 'N/A',
    'Bulk Approved': item.managerDecision?.isBulkApproved ? 'YES' : 'NO',
    'Final Cleared Days': item.managerDecision ? item.managerDecision.finalApprovedDays : item.internalApprovedDays,
    'Final Cleared Amount': item.managerDecision ? item.managerDecision.finalApprovedAmount : item.internalApprovedTotalAmount,
    'Justification Notes': item.managerDecision ? item.managerDecision.justificationNotes : '',
    'Vendor Correction Notes': item.vendorCorrection ? item.vendorCorrection.notes : ''
  }));

  const wsLedger = XLSX.utils.json_to_sheet(exportData);
  wsLedger['!cols'] = [
    { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 20 },
    { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 22 }, { wch: 12 },
    { wch: 35 }, { wch: 25 }, { wch: 22 }, { wch: 20 }, { wch: 20 },
    { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 45 }, { wch: 40 }
  ];
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Reconciliation_Ledger');

  // 3. Discrepancies Only Sheet
  const discrepanciesOnly = exportData.filter(i => i['Discrepancy Type'] !== 'PERFECT_MATCH');
  if (discrepanciesOnly.length > 0) {
    const wsExceptions = XLSX.utils.json_to_sheet(discrepanciesOnly);
    wsExceptions['!cols'] = wsLedger['!cols'];
    XLSX.utils.book_append_sheet(wb, wsExceptions, 'Discrepancy_Exceptions');
  }

  // 4. Audit Trail Sheet (if provided)
  if (auditLogs && auditLogs.length > 0) {
    const auditData = auditLogs.map(log => ({
      'Log ID': log.id,
      'Timestamp': log.timestamp,
      'Actor Name': log.actorName,
      'Actor Email': log.actorEmail,
      'Role': log.actorRole,
      'Action': log.action,
      'Details': log.details,
      'PO Number': log.poNumber || poNumber,
      'Delegated Review': log.isDelegated ? 'YES' : 'NO'
    }));
    const wsAudit = XLSX.utils.json_to_sheet(auditData);
    wsAudit['!cols'] = [
      { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 30 },
      { wch: 12 }, { wch: 25 }, { wch: 60 }, { wch: 18 }, { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, wsAudit, 'System_Audit_Trail');
  }

  const safePo = (poNumber || 'ALL_POS').replace(/[^a-zA-Z0-9-_]/g, '_');
  XLSX.writeFile(wb, `Reconciliation_Audit_Package_${safePo}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Exports data directly to CSV format and initiates browser download
 */
export function exportToCSV(rows: any[], filenamePrefix: string = 'Reconciliation_Export') {
  if (!rows || rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const csvOutput = XLSX.utils.sheet_to_csv(ws);
  
  const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports data directly to JSON format and initiates browser download
 */
export function exportToJSON(data: any, filenamePrefix: string = 'Reconciliation_Data') {
  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
  const link = document.createElement('a');
  link.setAttribute('href', jsonString);
  link.setAttribute('download', `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

