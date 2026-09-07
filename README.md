# INV Engine (Invoice Reconciliation Engine)

> **High-Performance Pre-Invoice Clearance & Goods Receipt Reconciliation Engine**  
> *Inspired by the power, precision, and throughput of an Internal Combustion Engine (ICE).*

---

## ⚡ Overview

**INV Engine** automates and accelerates the enterprise pre-invoice clearance workflow. It bridges the gap between vendor-submitted service invoices, internal approved timesheet masters, and SAP Ariba procurement systems before formal billing submission.

By catching discrepancies upfront, verifying multi-factor line items, and enforcing strict 4-day and 7-day SLAs with executive Domain COO oversight, INV Engine eliminates vendor billing rejections, unblocks Goods Receipt (GR) processing, and provides immutable audit clearance certificates.

---

## 🚀 Core Features

- **Multi-Factor Reconciliation**:
  - Automatically matches vendor invoice rows against central timesheet databases using Resource Email, Full Name, PO Number, and Month.
  - Flags rate variances, billed vs. approved day discrepancies, overtime deviations, and unauthorized resource line items.
- **Role-Based Workflows**:
  - **Vendor Initiators**: Upload invoices (Excel, CSV, cXML), review real-time pre-check results, download clearance tokens, or resubmit corrections.
  - **Resource Managers & Delegates**: Review flagged lines, approve variances with justification, adjust to internal approved days, or reject lines.
  - **Domain COO Executive Desk**: Executive oversight across business unit references (`UBR`), delegated sign-off authority, and SAP Ariba Goods Receipt (GR) alignment validation.
  - **Corporate AP & Finance Control**: Monitor overall batch clearance, audit logs, and reconciliation metrics.
- **SLA Governance & Automated Escalations**:
  - **Level 1 (4 Working Days)**: Escalates pending discrepancy reviews to the resource manager's Skip-Level Manager / VP.
  - **Level 2 (7 Calendar Days)**: Escalates overdue batches to the respective Domain COO for executive resolution.
- **Ariba Goods Receipt (GR) Pre-Validator**:
  - Cross-examines commercial vendor invoices against approved Pre-Invoice Clearance Certificates (PICC) before GR creation in SAP Ariba.
  - Strict pre-tax evaluation comparing billed days and daily rates.
- **Enterprise Reporting & Audit Trail**:
  - Generates verifiable Pre-Invoice Clearance Certificates (PICC) with cryptographic audit hashes and Ariba submission tokens.
  - Exports reconciliation packages to Excel, CSV, cXML, and PDF.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Motion
- **Tooling**: Vite, esbuild, TSX
- **Data & Parsing**: SheetJS (`xlsx`) for multi-format invoice spreadsheets

---

## 💻 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/lokesh-pa/INV-Engine.git
cd INV-Engine

# Install dependencies
npm install

# Start local development server
npm run dev
```

The application will be running at `http://localhost:3000`.

### Building for Production

```bash
npm run build
```

---

## 🔒 Security & Data Integrity

- Pre-tax evaluation standard across all reconciliation rules (taxes captured as metadata notes).
- Every approved batch issues an immutable cryptographic hash verification code and audit log.
