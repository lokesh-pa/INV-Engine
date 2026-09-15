# Product Specification & Roadmap: INV Engine (Pre-Invoice Reconciliation & Ariba Clearance Gateway)

**Document Version:** 2.0  
**Target Audience:** Lead Business Analysts, Solution Architects, Product Managers, Full-Stack Engineers, AP/Procurement Specialists  
**Product Code Name:** INV Engine (inspired by ICE - Internal Combustion Engine)  
**System Classification:** Enterprise Financial Middleware / Pre-Procurement Clearance System  
**Integration Targets:** SAP Ariba (cXML, Goods Receipt / SES), SAP ERP / S4HANA, Vendor Master, Central Timesheet DB, Microsoft 365 Outlook  

---

## 1. Executive Summary & Business Objective

### 1.1 The Business Problem
In Fortune 500 enterprises and large consulting engagements, contingent labor and IT service vendors submit monthly invoices directly to ERPs or procurement networks (e.g., SAP Ariba) with unverified hours, unauthorized rate cards, cross-PO errors, or unapproved overtime.
- **Traditional Process Flow:** Vendor works $\rightarrow$ Vendor submits invoice directly into SAP Ariba $\rightarrow$ Accounts Payable or Project Managers reject invoice after 15–30 days $\rightarrow$ Vendor investigates $\rightarrow$ Credit notes/debit memos issued $\rightarrow$ Dispute cycle takes 45–90 days.
- **Business Impact:** Blocked Goods Receipts (GR), delayed supplier payments (poor DSO), strained vendor relationships, high administrative overhead, compliance audit findings, and inaccurate accruals.

### 1.2 The "Shift-Left" Solution: INV Engine
**INV Engine** introduces an immutable **Pre-Invoice Clearance Certificate (PICC)** workflow that "shifts reconciliation to the left"—resolving all disputes *before* any commercial invoice or Goods Receipt is submitted to SAP Ariba:
1. **Pre-Submission Ingestion:** Vendors upload preliminary billing spreadsheets or draft PDF invoices before issuing formal tax invoices.
2. **Automated Multi-Factor Matching:** The engine performs instantaneous pre-tax 3-way matching against central client timesheets, contracted rate cards, and PO line allocations.
3. **Discrepancy Remediation & Escalation:** Line-item variances are routed to Resource Managers with strict **T+4 (Working Days)** and **T+7 (Calendar Days)** SLAs, escalating to Skip-Level VPs and Domain COOs.
4. **Certified Clearance Token (PICC):** Once approved, an immutable Pre-Invoice Clearance Certificate (with a cryptographic audit hash and Ariba submission token) is generated.
5. **Ariba GR Gatekeeper:** The Domain COO / AP Validator evaluates the final commercial invoice against the PICC. Goods Receipt (GR) creation is only permitted if the commercial invoice matches the cleared certificate.

---

## 2. System Architecture & High-Level Data Flow

### 2.1 End-to-End Workflow Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    1. INGESTION & MATCHING                                         |
|  [Vendor Portal]                                              [Central Timesheet DB]               |
|  Vendor uploads Excel/CSV/PDF Billing Draft                   Internal approved hours, PO rates    |
|               \                                                               /                    |
|                \-----> [INV Engine Multi-Factor Reconciliation Engine] <-----/                     |
|                                       |                                                            |
|                        Categorization & Variance Engine                                            |
|                        - Perfect Match (Routine)                                                   |
|                        - Days Overbilled / Underbilled                                             |
|                        - Rate Mismatches / Cross-PO Errors                                         |
+---------------------------------------+------------------------------------------------------------+
                                        |
+---------------------------------------v------------------------------------------------------------+
|                                    2. APPROVAL & REMEDIATION                                       |
|  Vendor remediation: "Align to Timesheet" or edit row -> Submit batch for approval                 |
|                                       |                                                            |
|       +-------------------------------+-------------------------------+                            |
|       |                                                               |                            |
|       v (<4 Working Days)                                             v (>4 Working Days)          |
|  [Resource Manager Portal]                                       [SLA Escalation Engine]           |
|  - Approve with reason                                           - Level 1: Skip-Level VP (T+4)   |
|  - Adjust to internal days                                       - Level 2: Domain COO (T+7)       |
|  - Reject line                                                                                     |
|  - Bulk sign-off / Delegation                                                                      |
+---------------------------------------+------------------------------------------------------------+
                                        |
+---------------------------------------v------------------------------------------------------------+
|                                    3. CERTIFICATE ISSUANCE                                         |
|  [PICC Certificate Generator]                                                                      |
|  - Generates immutable Certificate ID (e.g. AB-PICC-2026-0811)                                     |
|  - Issues Ariba Submission Code & SHA-256 Audit Verification Hash                                  |
|  - Distributes automated email notifications to Outlook Center                                    |
+---------------------------------------+------------------------------------------------------------+
                                        |
+---------------------------------------v------------------------------------------------------------+
|                                    4. ARIBA GATEKEEPER & GR POSTING                                |
|  [SAP Ariba Validator]                                                                             |
|  - Ingests Commercial Tax Invoice (PDF / Excel)                                                    |
|  - 3-Way Match: Commercial Invoice <==> PICC Certificate <==> Timesheet DB                         |
|  - Decision: [PROCEED_WITH_GR] or [DO_NOT_PROCEED_MISMATCH]                                        |
|  - Exports cXML InvoiceDetailRequest for direct SAP Ariba Network ingestion                        |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Detailed Functional Specifications (Module by Module)

### Module 1: Vendor Self-Service & Remediation Portal
**Purpose:** Empower supplier billing specialists to upload draft invoices, inspect line-by-line variances against client timesheet masters, correct errors before formal submission, and track clearance status.

#### Key Features & UI Layout
```
+----------------------------------------------------------------------------------------------------+
| VENDOR PORTAL: Global Consulting Inc.                                [Billing Month: 2026-08]     |
| [Upload Excel/CSV/PDF]  [Download Standard Template]  [Download Comparison Excel] [Initiate Approval] |
+----------------------------------------------------------------------------------------------------+
| KPI BANNER:                                                                                        |
| [ Total Claimed: $485,200 ]  [ Timesheet Approved: $450,000 ]  [ Net Variance: +$35,200 (7.8%) ]   |
| [ Total Lines: 42 ]          [ Matched: 31 ]                  [ Discrepancies: 11 ]                |
+----------------------------------------------------------------------------------------------------+
| DISCREPANCY & RECONCILIATION TABLE:                                                                |
| [ ] PO NUMBER  LINE  CONSULTANT           BILLED  APPROVED  DIFF   RATE    EXP. RATE   ACTIONS     |
| [x] PO-882194  10    Alex Rivera (Cloud)  22.0 d  20.0 d   +2.0d  $1,200  $1,200      [Align]     |
|                                                                                         [Correct]   |
|                                                                                         [Nudge Mgr] |
+----------------------------------------------------------------------------------------------------+
```

#### Detailed Functional Rules
1. **File Ingestion:**
   - Supports `.xlsx`, `.xls`, `.csv`, and `.pdf` files.
   - Drag-and-drop zone with auto-detection of column headers (supports aliases: `Resource Email` = `Email` = `Email Address`, `PO` = `Purchase Order Number`, `Billed Days` = `Days Worked` = `Quantity`).
2. **Reconciliation Analysis Rules:**
   - **Primary Key:** `Resource Email` (case-insensitive trimmed).
   - **Fallback Composite Key:** `Resource Name` + `PO Number` + `Billing Month`.
   - **Line Item Mapping:** Maps to specific PO Line Item (e.g., `00010`) to enforce service categorization.
   - **Variance Calculation:**
     $$\text{Days Variance} = \text{Billed Days} - \text{Internal Approved Days}$$
     $$\text{Financial Variance} = (\text{Billed Days} \times \text{Claimed Rate}) - (\text{Approved Days} \times \text{Contract Rate})$$
3. **One-Click Auto-Alignment ("Align to Timesheet"):**
   - When a discrepancy is purely due to unapproved days (e.g., billed 22 days vs approved 20 days), vendor can click **Align to Timesheet**.
   - The engine instantly updates the billed days to 20, eliminates the variance, marks the row as `AUTO_MATCHED`, and archives the original claim in `vendorCorrection` history.
4. **Contextual & Bulk Manager Nudges:**
   - For unresolved variances, vendors can click **Nudge Manager** to send an instant notification to the assigned manager's Outlook inbox.
   - Multi-select checkboxes allow **Bulk Nudge Managers** for all selected items.
5. **Revised Ingestion & PICC Collection:**
   - If a manager rejects a line, the vendor can upload a revised invoice sheet. The system increments `revisionNumber` (e.g., Rev 2), preserving audit continuity.
   - Once all lines are resolved, the vendor can download the formal **PICC Certificate** and **Comparison Excel Report**.

---

### Module 2: Resource Manager Approval Desk
**Purpose:** Dedicated dashboard for Project Managers, Delivery Leads, and Cost Center Owners to review, authorize, adjust, or reject invoice discrepancies for consultants working on their projects.

#### Key Features & UI Layout
```
+----------------------------------------------------------------------------------------------------+
| MANAGER PORTAL: Review Desk                             [Billing Month: 2026-08 (August 2026)]     |
| Logged in: Sarah Jenkins (Engineering Director)         [Delegation: Active]  [Bulk Approval (4)]   |
+----------------------------------------------------------------------------------------------------+
| INVOICE BATCH CARDS (PO HIERARCHY):                                                                |
| +-----------------------------------------+  +-----------------------------------------+           |
| | PO-882194                   [4 Lines]   |  | PO-449102                   [2 Lines]   |           |
| | Vendor: Infosys Tech        T+2 Days    |  | Vendor: Cognizant Services  T+5 Days ⚠️ |           |
| | Variance: +$4,800 USD       [Active]    |  | Variance: +$1,600 USD       [Escalated] |           |
| +-----------------------------------------+  +-----------------------------------------+           |
+----------------------------------------------------------------------------------------------------+
| PENDING LINE ITEMS TABLE (PO-882194):                                                              |
| CONSULTANT       ROLE         CLAIMED   APPROVED  VARIANCE  SEVERITY  ACTIONS                      |
| Alex Rivera      Sr Architect 22.0 d    20.0 d    +2.0 d    CRITICAL  [Approve Var] [Adjust] [Rej] |
| Notes: "Weekend deployment support requested by client VP"                                         |
+----------------------------------------------------------------------------------------------------+
```

#### Detailed Functional Rules
1. **Prominent Billing Month Header:**
   - Displays prominent calendar badge: `Billing Month: YYYY-MM (Month Year)` ensuring approvers never sign off on the wrong accounting cycle.
2. **PO Hierarchy Visual Standards:**
   - **PO Number:** Dominant monospace font (`font-black font-mono text-slate-900 text-lg`) with high-contrast indicator.
   - **Line Count:** Subtle secondary pill badge (`text-[10px] bg-slate-100 border border-slate-200`) so attention is focused on the purchase order contract.
3. **Manager Decision Actions:**
   - **Approve Variance (`APPROVE_VARIANCE`):** Manager authorizes vendor's excess billing. **Requires mandatory text justification** (minimum 10 characters, e.g., *"Approved due to emergency prod migration on Aug 15"*).
   - **Adjust to Timesheet (`ADJUST_TO_INTERNAL`):** Forces billing days to match client approved timesheet. Clears variance for invoice processing while billing only approved days.
   - **Reject Billing (`REJECT_BILLING`):** Rejects line item with feedback notes sent back to vendor portal for re-submission.
   - **Approve Routine (`APPROVE_ROUTINE`):** Fast-path approval for exact-match lines.
4. **Bulk Sign-Off Wizard:**
   - Managers can select multiple routine or minor variance lines and execute bulk approvals with a single justification signature.
5. **Delegation of Authority (Out-Of-Office Delegation):**
   - Managers can delegate review rights to a peer or skip-level manager with start date, end date, and scope (`ALL_RESOURCES` or `SPECIFIC_PO`).
   - Audit trail captures `isDelegated: true` and `delegatedByEmail`.

---

### Module 3: Executive Domain COO & SLA Governance Engine
**Purpose:** Prevent invoice gridlock and ensure enterprise accountability through strict time-based escalations and executive intervention desks.

#### Key Features & Escalation Logic
```
       [Day 0: Batch Ingestion & Approval Initiated]
                            |
                     (4 Working Days)
                            |
   +------------------------v------------------------+
   | LEVEL 1 ESCALATION: Skip-Level Manager / VP     |
   | - System flags line with amber warning badge    |
   | - Sends urgent Outlook notification to VP       |
   | - Grants VP co-approval authority               |
   +------------------------+------------------------+
                            |
                     (7 Calendar Days)
                            |
   +------------------------v------------------------+
   | LEVEL 2 ESCALATION: Executive Domain COO        |
   | - Batch status shifts to CRITICAL_ESCALATION    |
   | - Domain COO receives executive briefing        |
   | - Grants Domain COO absolute override authority |
   +-------------------------------------------------+
```

#### Detailed Functional Rules
1. **Working Day vs. Calendar Day Calculation:**
   - Level 1 uses **Working Days** (excluding Saturdays and Sundays).
   - Level 2 uses strict **Calendar Days** (elapsed time since `approvalInitiatedAt`).
2. **Domain COO Mapping (`DomainCooMapping`):**
   - Maps enterprise business domains and Unit Business Reference (`UBR`) codes (e.g., `UBR-CLOUD-01`, `UBR-DIGITAL-02`) to the responsible Executive COO.
   - Links delivery managers, skip-level VPs, and department codes under each executive umbrella.
3. **Domain COO Powers:**
   - Absolute override sign-off across all pending POs.
   - Direct authorization to proceed or halt SAP Ariba Goods Receipt (GR) postings.

---

### Module 4: Finance & AP Executive Dashboard
**Purpose:** Provide corporate Controllers, Accounts Payable heads, and Procurement Leaders complete real-time oversight of contingent labor liabilities, tax exposure, touchless clearance rates, and audit compliance.

#### Key Features & UI Layout
```
+----------------------------------------------------------------------------------------------------+
| FINANCE DASHBOARD: Enterprise AP Control Desk                           [August 2026 Processing]   |
+----------------------------------------------------------------------------------------------------+
| METRIC TILES:                                                                                      |
| [ Total Gross Liability ]  [ Resolved / Cleared ]  [ Disputed Variance ]  [ Touchless Match Rate ]  |
|      $1,842,500 USD              $1,720,100 USD          $122,400 USD              76.4%           |
+----------------------------------------------------------------------------------------------------+
| ANALYTICS GRID:                                                                                    |
| [ Discrepancy Breakdown (Donut) ]       [ 6-Month Clearance Velocity & Volume (Bar / Area Chart) ] |
| - Days Overbilled: 48%                  - Tracks average processing days (T+6.2 -> T+2.8)          |
| - Rate Mismatches: 24%                  - Compares total billed vs cleared over time               |
| - Unmapped Resources: 18%                                                                          |
| - Unapproved Timesheets: 10%                                                                       |
+----------------------------------------------------------------------------------------------------+
| ACTIVE BATCH CLEARANCE CONTROL:                                                                    |
| BATCH ID   PO NUMBER  VENDOR         BILLED    CLEARED   STATUS           PICC CERTIFICATE ACTIONS |
| BAT-0811   PO-882194  Infosys Tech   $485,200  $480,400  CLEARED_ARIBA    [View PICC] [Export cXML]|
+----------------------------------------------------------------------------------------------------+
```

#### Detailed Functional Rules
1. **Pre-Tax Reconciliation Standard:**
   - All core line comparisons are strictly calculated on **pre-tax base figures** ($Billed Days \times Daily Rate$).
   - Prevents regional tax rule variances (VAT, GST, State Sales Tax, reverse-charge) from corrupting operational timesheet reconciliation.
2. **Tax Engine (`TaxConfig` & `TaxCalculationResult`):**
   - Configurable tax regimes per supplier/jurisdiction: `VAT`, `GST`, `SALES_TAX`, or `NONE`.
   - Reverse-charge mechanisms and withholding tax (TDS) calculations computed at certificate issuance.
3. **Clearance Certificate Issuance (`PreInvoiceClearance`):**
   - Formally locks the batch upon 100% line item resolution.
   - Calculates immutable SHA-256 cryptographic verification hash:
     $$\text{Audit Hash} = \text{SHA256}(\text{CertificateId} + \text{PONumber} + \text{ClearedAmount} + \text{Timestamp})$$
   - Generates Ariba submission token (e.g., `ARIBA-PICC-2026-X991`).

---

### Module 5: SAP Ariba Goods Receipt (GR) & SES Validator
**Purpose:** The final enterprise gatekeeper. Before Goods Receipt (GR) or Service Entry Sheet (SES) is posted in SAP Ariba, this engine cross-examines the actual commercial vendor invoice (PDF or Excel) against the issued PICC.

#### Key Features & UI Layout
```
+----------------------------------------------------------------------------------------------------+
| SAP ARIBA GR VALIDATOR: Pre-Procurement Gatekeeper                                                |
| Mode: Commercial Invoice PDF Ingestion & 3-Way Match                                               |
+----------------------------------------------------------------------------------------------------+
| [Upload Commercial PDF/Excel Invoice]   [Load Pre-Approved PICC Certificate: AB-PICC-2026-0811]     |
+----------------------------------------------------------------------------------------------------+
| VALIDATION RESULT BANNER:                                                                          |
| [ Status: PROCEED_WITH_GR  ✅ ]  Total Days Diff: 0.0 d  | Financial Diff: $0.00                   |
| "Commercial PDF Invoice perfectly matches Approved PICC Certificate. Safe to create Ariba GR."      |
+----------------------------------------------------------------------------------------------------+
| 3-WAY MATCHING AUDIT GRID:                                                                         |
| LINE  RESOURCE         ACTUAL PDF INVOICE     APPROVED PICC CERTIFICATE   MATCH STATUS             |
| 1     Alex Rivera      20.0 d @ $1,200/d      20.0 d @ $1,200/d           MATCH ✅                 |
| 2     Priya Patel      18.0 d @ $1,100/d      18.0 d @ $1,100/d           MATCH ✅                 |
+----------------------------------------------------------------------------------------------------+
| ACTIONS:                                                                                           |
| [Download Formal Audit PDF Report]  [Generate Ariba cXML Invoice]  [Post Goods Receipt (Simulated)]|
+----------------------------------------------------------------------------------------------------+
```

#### Detailed Functional Rules
1. **Commercial PDF Invoice Parser (`pdfjs-dist`):**
   - Extracts raw text and tabular structures from vendor PDF invoices.
   - Identifies consultant names, emails, billing days, and rates using regex heuristics and column bounding box detection.
2. **Strict Pre-Tax 3-Way Cross-Examination:**
   $$\text{Commercial Invoice Lines} \iff \text{PICC Approved Lines} \iff \text{Internal Approved Timesheets}$$
3. **Decision Engine:**
   - `PROCEED_WITH_GR`: If all line days and rates match PICC certificate within 0.001 tolerance.
   - `DO_NOT_PROCEED_MISMATCH`: If vendor attempted to bill unapproved days or uncertified rates on the final commercial invoice. Halts Ariba GR posting and flags Accounts Payable.
4. **Ariba cXML Generator:**
   - Generates standard `cXML InvoiceDetailRequest` containing the PICC token in the header and itemized lines ready for automated ingestion via Ariba Network Buyer cXML endpoint.

---

### Module 6: Microsoft Outlook Mailbox Notification Center
**Purpose:** A dedicated Microsoft 365 Outlook mailbox simulation embedded inside the platform to ensure enterprise communication and approval requests reach stakeholders with high fidelity.

#### Key Features & UI Layout
```
+----------------------------------------------------------------------------------------------------+
| [:::] Outlook   | Search mail, contacts, and POs...                                [User Avatar]   |
+----------------------------------------------------------------------------------------------------+
| [ + New mail ]  [ Delete ]  [ Archive ]  [ Mark as read ]  [ Filter: Urgent Approvals v ]          |
+----------------------------------------------------------------------------------------------------+
| FOLDERS        | MESSAGE LIST (Focused / Other) | READING PANE                                     |
| > Inbox (14)   | [Focused]  Other               | Re: ACTION REQUIRED: PO-882194 Discrepancies     |
|   - Approvals  | Sarah Jenkins       10:14 AM   | From: INV Engine <system@ab-company.com>         |
|   - PICC Done  | URGENT: PO-882194 Review Req   | To: Sarah Jenkins <sjenkins@ab-company.com>      |
|   - Nudges     | 4 lines pending sign-off...    | ------------------------------------------------ |
| > Sent         |                                | Dear Sarah,                                      |
| > Archive      | AP Automation        9:30 AM   | 4 discrepancy lines require your authorization   |
| > Deleted      | PICC Cleared: AB-PICC-0811     | for PO-882194 (Infosys Tech - Aug 2026).         |
|                | Certificate generated...       |                                                  |
|                |                                | [ Review & Authorize in Manager Portal -> ]      |
+----------------------------------------------------------------------------------------------------+
```

#### Detailed Functional Rules
1. **Outlook Aesthetic & Layout Standards:**
   - Top application bar in Microsoft `#0078D4` brand blue with app launcher waffle icon and global search.
   - Standard 3-pane layout (Folder Navigation Rail $\rightarrow$ Message List $\rightarrow$ Message Reading Pane).
   - "Focused" vs. "Other" message segregation.
2. **Corporate Notification Types:**
   - `MANAGER_DISCREPANCY_ALERT`: Triggered upon vendor batch submission.
   - `CRITICAL_ESCALATION_NOTICE`: Sent to Skip-Level VPs (T+4) and Domain COOs (T+7).
   - `PICC_ISSUANCE_CONFIRMATION`: Sent to Vendor and AP with attachment tokens.
   - `CONTEXTUAL_NUDGE`: Triggered on-demand by vendors or finance administrators.
3. **Deep-Linking:**
   - Every email contains a direct routing button (e.g. `directToolUrl`) that switches the user session and loads the exact target batch modal.

---

### Module 7: Central Timesheet Master & Role-Based Access Control (RBAC)
**Purpose:** Manage internal client timesheet truth and enforce strict enterprise access boundaries.

#### Role & Permission Matrix

| Role | Upload Invoices | View Own Data | Review Lines | Authorize Variances | Domain COO Escalation | Validate Ariba GR | System Admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Vendor** (`vendor`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Resource Manager** (`manager`) | ❌ | ❌ | ✅ (Assigned) | ✅ (Assigned) | ❌ | ❌ | ❌ |
| **Domain COO** (`domain_coo`) | ❌ | ❌ | ✅ (Domain) | ✅ (Domain) | ✅ | ✅ | ❌ |
| **Finance / AP** (`finance`) | ❌ | ✅ (All) | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Auditor / Admin** (`admin`) | ❌ | ✅ (All) | ✅ (All) | ✅ (Override) | ✅ | ✅ | ✅ |

---

## 4. Comprehensive Data Models & Schemas

### 4.1 Internal Timesheet Master Schema (`InternalTimesheet`)
```typescript
interface InternalTimesheet {
  id: string;                      // Unique UUID
  resourceEmail: string;           // Common primary matching key (e.g. 'alex.rivera@vendor.com')
  resourceName: string;            // Consultant full legal name
  poNumber: string;                // Active SAP Purchase Order Number (e.g. 'PO-882194')
  poLineItem: string;              // Specific PO line (e.g. '00010')
  admSeniority: string;            // Role seniority ('Junior', 'Senior', 'Principal')
  admRole: string;                 // Standardized ADM role code
  locationCity: string;            // Work location
  vendorName: string;              // Legal supplier entity name
  billingMonth: string;            // Format: 'YYYY-MM'
  approvedDays: number;            // Quantified work units approved in internal timesheet (e.g. 20.0)
  approvedHours: number;           // approvedDays * 8.0
  contractDailyRate: number;       // Contracted pre-tax day rate (e.g. 1200.00)
  currency: 'USD' | 'EUR' | 'GBP' | 'INR' | 'SGD';
  projectCode: string;             // Client internal project code
  projectName: string;             // Project display title
  department: string;              // Client cost center / department
  managerEmail: string;            // Responsible Resource Manager corporate email
  managerName: string;             // Responsible Resource Manager name
  status: 'Approved' | 'Submitted' | 'Draft';
  lastLoggedDate: string;          // ISO Timestamp
}
```

### 4.2 Discrepancy & Line Item Schema (`DiscrepancyItem`)
```typescript
interface DiscrepancyItem {
  id: string;
  batchId: string;
  invoiceRowId: string;
  resourceEmail: string;
  resourceName: string;
  vendorName: string;
  poNumber: string;
  poLineItem: string;
  billingMonth: string;
  currency: Currency;
  
  // Quantities & Rates (Strictly Pre-Tax)
  billedDays: number;
  internalApprovedDays: number;
  daysVariance: number;              // billedDays - internalApprovedDays
  claimedDailyRate: number;
  contractDailyRate: number;
  billedTotalAmount: number;
  internalApprovedTotalAmount: number;
  financialVarianceAmount: number;   // billedTotalAmount - internalApprovedTotalAmount
  
  // Categorization
  discrepancyType: 
    | 'PERFECT_MATCH' 
    | 'DAYS_OVERBILLED' 
    | 'DAYS_UNDERBILLED' 
    | 'RATE_MISMATCH' 
    | 'RESOURCE_NOT_FOUND' 
    | 'CROSS_PO_MISMATCH' 
    | 'TIMESHEET_UNAPPROVED';
  severity: 'MATCH' | 'MINOR' | 'CRITICAL' | 'UNMAPPED';
  status: DiscrepancyStatus;
  
  // Manager Assignment & Decisions
  managerEmail: string;
  managerName: string;
  managerDecision?: {
    decidedByEmail: string;
    decidedByName: string;
    decidedAt: string;
    action: 'APPROVE_VARIANCE' | 'ADJUST_TO_INTERNAL' | 'REJECT_BILLING' | 'APPROVE_ROUTINE';
    finalApprovedDays: number;
    finalApprovedAmount: number;
    justificationNotes: string;
  };
}
```

### 4.3 Pre-Invoice Clearance Certificate Schema (`PreInvoiceClearance`)
```typescript
interface PreInvoiceClearance {
  certificateId: string;             // e.g. 'AB-PICC-2026-0811'
  batchId: string;
  poNumber: string;
  vendorName: string;
  billingMonth: string;
  currency: Currency;
  issuedAt: string;                  // ISO 8601 Timestamp
  issuedBy: string;
  totalClearedDays: number;
  totalClearedAmount: number;        // Strictly Pre-Tax base total
  reconciledLineItemsCount: number;
  aribaSubmissionCode: string;       // Encrypted / unique hash token
  verificationAuditHash: string;     // SHA-256 cryptographic signature
  status: 'CLEARED_EXACT' | 'CLEARED_WITH_APPROVED_EXCEPTIONS' | 'HELD';
  notes: string;
  taxConfig?: TaxConfig;
  taxCalculation?: TaxCalculationResult;
}
```

---

## 5. Phased Product Roadmap

```
+----------------------------------------------------------------------------------------------------+
|                                      PRODUCT ROADMAP TIMELINE                                      |
+--------------------+---------------------+---------------------+-----------------------------------+
| PHASE 1: MONTH 1-2 | PHASE 2: MONTH 3-4  | PHASE 3: MONTH 5-6  | PHASE 4: MONTH 7-8                |
| Core Engine & Ingest| Workflows & SLAs    | SAP Ariba Gateway   | Enterprise Scale & AI Predict     |
+--------------------+---------------------+---------------------+-----------------------------------+
| - Multi-factor     | - Manager Portal    | - PDF Parser        | - Direct SAP Ariba REST / cXML    |
|   reconciliation   | - Bulk approvals    |   (`pdfjs-dist`)    |   PunchOut integration            |
| - Excel/CSV parser | - T+4 & T+7 SLAs    | - 3-Way Match engine| - Live SSO / Azure AD / Okta      |
| - Tolerance rules  | - Domain COO Desk   | - PICC Certificate  | - Automated anomaly detection     |
| - Vendor portal    | - Delegation of Auth|   issuance & audit  | - ERP Accrual Auto-Journal Entry  |
| - Baseline RBAC    | - Outlook Center    | - cXML generation   | - Multi-language locale support   |
+--------------------+---------------------+---------------------+-----------------------------------+
```

### Phase 1: MVP Core Reconciliation Engine (Months 1–2)
- **Goal:** Deliver reliable, automated line-item reconciliation between vendor spreadsheets and central timesheets.
- **Deliverables:**
  - Ingestion engine for Excel (`.xlsx`), `.csv` with column mapping intelligence.
  - Core matching algorithm: primary email match, fuzzy name fallback, cross-PO detection.
  - Basic Vendor Portal: discrepancy matrix, "Align to Timesheet" auto-remediation, export comparison.
  - Static role switching and in-memory mock central database.
- **Success Criteria:** 100% accurate identification of rate and day variance across test batches of 1,000+ rows within < 1.5 seconds.

### Phase 2: Role-Based Portals, Manager Approvals & SLA Governance (Months 3–4)
- **Goal:** Implement end-to-end human-in-the-loop dispute resolution and enterprise SLA governance.
- **Deliverables:**
  - Resource Manager Review Desk with PO hierarchy, prominent billing month banners, and line-item actions.
  - Mandatory justification notes modal for variance approvals.
  - Bulk approval wizard for high-volume transactions.
  - SLA Escalation Engine: Automated Level 1 (T+4 Working Days) and Level 2 (T+7 Calendar Days) triggers.
  - Executive Domain COO desk with Unit Business Reference (UBR) oversight.
  - Out-of-Office Delegation of Authority engine.
  - Integrated Microsoft Outlook Mailbox Notification Center.
- **Success Criteria:** Reduction of manager dispute review cycle time from industry baseline of 18 days to $\le 3.5$ days.

### Phase 3: SAP Ariba GR Validator, PDF Ingestion & PICC Issuance (Months 5–6)
- **Goal:** Complete the pre-procurement circle with commercial invoice validation and clearance certificates.
- **Deliverables:**
  - Pre-Invoice Clearance Certificate (PICC) issuance engine with SHA-256 audit verification codes.
  - Client-side commercial invoice PDF parser (`pdfjs-dist`) for tabular consultant line extraction.
  - 3-Way matching validator (Commercial Invoice $\iff$ PICC $\iff$ Timesheet Master).
  - Decision engine: `PROCEED_WITH_GR` vs `DO_NOT_PROCEED_MISMATCH`.
  - cXML `InvoiceDetailRequest` export package for direct Ariba Network posting.
  - Executive Finance & AP Control Dashboard with historical analytics (Recharts).
- **Success Criteria:** Zero commercial invoice rejections in SAP Ariba for all PICC-cleared batches.

### Phase 4: Enterprise System Integration & Predictive Intelligence (Months 7–8)
- **Goal:** Production ERP integration, enterprise SSO, and predictive machine learning.
- **Deliverables:**
  - Native integration with SAP S/4HANA / ECC via BAPI/OData for automatic Goods Receipt generation.
  - Direct Ariba Network Buyer cXML POST channel.
  - SAML 2.0 / OpenID Connect enterprise Single Sign-On (Azure AD, Okta, Ping).
  - Machine learning models predicting high-variance vendors and suggesting auto-approval thresholds for trusted suppliers.
  - Automated month-end AP accrual journal entry generator based on approved draft timesheets.
- **Success Criteria:** $\ge 85\%$ touchless clearance rate; enterprise-wide compliance audit score of 100%.

---

## 6. Verification Algorithms & Cryptographic Audit Standards

### 6.1 Cryptographic Hash Verification Algorithm
To guarantee that a PICC certificate cannot be tampered with or modified after manager authorization:
```
Data Payload String:
  "{CertificateId}|{BatchId}|{PONumber}|{BillingMonth}|{TotalClearedDays}|{TotalClearedAmount}|{IssuedAt}"

Verification Hash = HexEncode(HMAC_SHA256(SecretKey, DataPayloadString))
```
When Accounts Payable or an external auditor inspects the certificate, the validator re-computes the hash from the recorded line items. If a single day, dollar, or rate was altered, the hash check fails instantly.

### 6.2 Pre-Tax Evaluation Rule
All reconciliation calculations adhere strictly to the **International Pre-Tax Matching Principle**:
$$\text{Line Match} = (\text{Billed Days} == \text{Approved Days}) \land (\text{Claimed Rate} == \text{Contract Rate})$$
Regional taxes (e.g., Canadian GST, German MwSt, UK VAT, Indian CGST/SGST) are recorded as non-operational settlement metadata. Invoices cannot be rejected due to tax format variations during timesheet reconciliation.

---

## 7. Hand-Off Checklist for Business Analysts & Development Teams

When handing this specification over to engineering and business analyst squads:
1. **Spreadsheet Ingestion Testing:** Verify with BA the exact column aliases used by existing vendors (e.g., Capgemini, TCS, Wipro, Accenture) to configure header normalizers.
2. **ERP Master Data Connectors:** Confirm whether timesheet records will be synced via daily SFTP CSV batches, Kafka topics, or REST API endpoints from the central workforce management tool (e.g., SAP Fieldglass, Beeline, Workday).
3. **SLA Calendar Customization:** Configure holiday calendars per operating geography (US, UK, Germany, India) for the T+4 Working Day calculation.
4. **Approval Threshold Limits:** Verify corporate Delegation of Authority (DOA) financial thresholds (e.g., managers can approve variances up to $\$5,000$; amounts above $\$5,000$ require Department Head / VP sign-off).
5. **Ariba Network Credentials:** Obtain Ariba Network ID (ANID), Shared Secret, and Buyer cXML endpoint URLs for direct Phase 4 posting.
