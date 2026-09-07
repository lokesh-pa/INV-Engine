import { InvoiceBatch, PreInvoiceClearance, TaxConfig } from '../types';
import { formatCurrency, calculateTax, DEFAULT_TAX_CONFIG } from './reconciliationEngine';

/**
 * Generates an SAP Ariba-compliant cXML (commerce eXtensible Markup Language) document
 * for the Pre-Invoice Clearance Certificate (PICC) as an InvoiceDetailRequest.
 *
 * Vendors can attach this directly or inject it into their SAP Ariba Network supplier profile
 * to ensure 100% first-pass invoice match without ERP mismatch rejections.
 */
export function generateAribaCxml(
  batch: InvoiceBatch, 
  certificate: PreInvoiceClearance, 
  taxConfig?: TaxConfig
): string {
  const timestamp = certificate.issuedAt || new Date().toISOString();
  const safePo = escapeXml(batch.poNumber);
  const safeVendor = escapeXml(batch.vendorName);
  const safeVendorEmail = escapeXml(batch.vendorEmail);
  const safeMonth = escapeXml(batch.billingMonth);
  const safeToken = escapeXml(certificate.aribaSubmissionCode);
  const safeCertId = escapeXml(certificate.certificateId);
  const safeHash = escapeXml(certificate.verificationAuditHash);
  const currency = certificate.currency || 'USD';

  const resolvedTaxConfig = taxConfig || certificate.taxConfig || batch.taxConfig || DEFAULT_TAX_CONFIG;
  const tax = calculateTax(certificate.totalClearedAmount, resolvedTaxConfig);

  const lineItemsXml = batch.items.map((item, idx) => {
    const finalDays = item.managerDecision 
      ? item.managerDecision.finalApprovedDays 
      : (item.internalApprovedDays ?? item.billedDays);
    const unitRate = item.claimedDailyRate;
    const lineTotal = item.managerDecision 
      ? item.managerDecision.finalApprovedAmount 
      : +(finalDays * unitRate).toFixed(2);
    const managerNote = item.managerDecision 
      ? `Approved by ${item.managerDecision.decidedByName}: ${item.managerDecision.justificationNotes}`
      : 'Auto-cleared 100% timesheet match';

    return `          <InvoiceDetailItem lineNumber="${idx + 1}" quantity="${finalDays}">
            <UnitOfMeasure>DAY</UnitOfMeasure>
            <UnitPrice>
              <Money currency="${currency}">${unitRate.toFixed(2)}</Money>
            </UnitPrice>
            <SubtotalAmount>
              <Money currency="${currency}">${lineTotal.toFixed(2)}</Money>
            </SubtotalAmount>
            <InvoiceDetailItemReference lineNumber="${idx + 1}">
              <ItemID>
                <SupplierPartID>${escapeXml(item.resourceEmail)}</SupplierPartID>
                <BuyerPartID>${escapeXml(item.projectCode || 'PRJ-CONSULTING')}</BuyerPartID>
              </ItemID>
              <Description xml:lang="en-US">Professional Consulting: ${escapeXml(item.resourceName)} (${escapeXml(item.resourceEmail)}) - Period: ${safeMonth}. Rationale: ${escapeXml(managerNote)}</Description>
            </InvoiceDetailItemReference>
            <Extrinsic name="ResourceEmail">${escapeXml(item.resourceEmail)}</Extrinsic>
            <Extrinsic name="ResourceName">${escapeXml(item.resourceName)}</Extrinsic>
            <Extrinsic name="InternalApprovedDays">${item.internalApprovedDays}</Extrinsic>
            <Extrinsic name="VendorBilledDays">${item.billedDays}</Extrinsic>
            <Extrinsic name="DiscrepancyStatus">${escapeXml(item.status)}</Extrinsic>
            <Extrinsic name="ManagerSignOff">${escapeXml(managerNote)}</Extrinsic>
          </InvoiceDetailItem>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.040/InvoiceDetail.dtd">
<cXML payloadID="PICC-${safeCertId}@abcompany.com" timestamp="${timestamp}" xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="NetworkID">
        <Identity>${safeVendor.replace(/[^a-zA-Z0-9]/g, '')}</Identity>
      </Credential>
      <Credential domain="Email">
        <Identity>${safeVendorEmail}</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkID">
        <Identity>AN01000000001-ABCOMPANY</Identity>
      </Credential>
      <Credential domain="CompanyID">
        <Identity>AB-COMPANY-GLOBAL-INC</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkID">
        <Identity>ABCOMPANY-PICC-GATEWAY</Identity>
        <SharedSecret>ARIBAPICCSECURE2026</SharedSecret>
      </Credential>
      <UserAgent>AB Company Pre-Invoice Clearance Engine v2.4 (SAP Ariba Certified Integration)</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="production">
    <InvoiceDetailRequest>
      <InvoiceDetailRequestHeader
        invoiceID="PICC-${safePo}-${safeMonth}"
        purpose="standard"
        operation="new"
        invoiceDate="${timestamp}">
        <InvoiceDetailHeaderIndicator/>
        <InvoicePartner>
          <Contact role="billFrom">
            <Name xml:lang="en-US">${safeVendor}</Name>
            <EmailAddress>${safeVendorEmail}</EmailAddress>
          </Contact>
          <Contact role="billTo">
            <Name xml:lang="en-US">AB Company Global Inc.</Name>
            <PostalAddress name="AccountsPayable">
              <Street>100 Technology Plaza, Suite 400</Street>
              <City>New York</City>
              <State>NY</State>
              <PostalCode>10001</PostalCode>
              <Country isoCountryCode="US">United States</Country>
            </PostalAddress>
            <EmailAddress>ap-reconcile@abcompany.com</EmailAddress>
          </Contact>
          <Contact role="remitTo">
            <Name xml:lang="en-US">${safeVendor} - Accounts Receivable</Name>
            <EmailAddress>${safeVendorEmail}</EmailAddress>
          </Contact>
        </InvoicePartner>
        
        <!-- Mandatory SAP Ariba PICC Governance Attributes -->
        <Extrinsic name="PreClearanceReference">${safeToken}</Extrinsic>
        <Extrinsic name="CertificateId">${safeCertId}</Extrinsic>
        <Extrinsic name="DigitalAuditHash">${safeHash}</Extrinsic>
        <Extrinsic name="ReconciliationStatus">${escapeXml(certificate.status)}</Extrinsic>
        <Extrinsic name="TotalClearedDays">${certificate.totalClearedDays}</Extrinsic>
        <Extrinsic name="ReconciledLineItemsCount">${certificate.reconciledLineItemsCount}</Extrinsic>
        <Extrinsic name="ClearanceAuthority">AB Company Automated Timesheet Governance Service</Extrinsic>
        <Extrinsic name="IssuedBy">${escapeXml(certificate.issuedBy)}</Extrinsic>
        <Extrinsic name="TaxJurisdiction">${escapeXml(tax.taxJurisdiction)}</Extrinsic>
        <Extrinsic name="WithholdingTaxRate">${tax.withholdingTaxRate}%</Extrinsic>
        <Extrinsic name="WithholdingTaxAmount">${tax.withholdingTaxAmount.toFixed(2)}</Extrinsic>
        <Extrinsic name="NetPayableAmount">${tax.netPayableAmount.toFixed(2)}</Extrinsic>
      </InvoiceDetailRequestHeader>

      <InvoiceDetailOrder>
        <InvoiceDetailOrderInfo>
          <OrderReference orderID="${safePo}">
            <DocumentReference payloadID="PO-${safePo}"/>
          </OrderReference>
        </InvoiceDetailOrderInfo>

        <!-- Authorized & Reconciled Line Items Schedule -->
${lineItemsXml}
      </InvoiceDetailOrder>

      <InvoiceDetailSummary>
        <SubtotalAmount>
          <Money currency="${currency}">${tax.netAmount.toFixed(2)}</Money>
        </SubtotalAmount>
        <Tax>
          <Money currency="${currency}">${tax.taxAmount.toFixed(2)}</Money>
          <Description xml:lang="en-US">${tax.isReverseCharge ? 'Reverse Charge Applicable' : `${tax.taxType} ${tax.taxRate}% - ${tax.taxJurisdiction}`}</Description>
          <TaxDetail category="${tax.taxType}" percentageRate="${tax.taxRate}">
            <TaxableAmount>
              <Money currency="${currency}">${tax.netAmount.toFixed(2)}</Money>
            </TaxableAmount>
            <TaxAmount>
              <Money currency="${currency}">${tax.taxAmount.toFixed(2)}</Money>
            </TaxAmount>
            <TaxLocation xml:lang="en-US">${escapeXml(tax.taxJurisdiction)}</TaxLocation>
          </TaxDetail>
        </Tax>
        <GrossAmount>
          <Money currency="${currency}">${tax.grossAmount.toFixed(2)}</Money>
        </GrossAmount>
        <NetAmount>
          <Money currency="${currency}">${tax.netPayableAmount.toFixed(2)}</Money>
        </NetAmount>
      </InvoiceDetailSummary>
    </InvoiceDetailRequest>
  </Request>
</cXML>`;
}

/**
 * Generates an SAP Ariba-compliant Service Entry Sheet (SES) cXML document.
 * In enterprise contingent labor POs, an approved SES is the prerequisite
 * required by SAP Ariba Network before commercial invoice posting can occur.
 */
export function generateServiceEntrySheetCxml(
  batch: InvoiceBatch, 
  certificate: PreInvoiceClearance,
  taxConfig?: TaxConfig
): string {
  const timestamp = certificate.issuedAt || new Date().toISOString();
  const safePo = escapeXml(batch.poNumber);
  const safeVendor = escapeXml(batch.vendorName);
  const safeVendorEmail = escapeXml(batch.vendorEmail);
  const safeMonth = escapeXml(batch.billingMonth);
  const safeToken = escapeXml(certificate.aribaSubmissionCode);
  const safeCertId = escapeXml(certificate.certificateId);
  const safeHash = escapeXml(certificate.verificationAuditHash);
  const currency = certificate.currency || 'USD';

  const resolvedTaxConfig = taxConfig || certificate.taxConfig || batch.taxConfig || DEFAULT_TAX_CONFIG;
  const tax = calculateTax(certificate.totalClearedAmount, resolvedTaxConfig);

  const sesItemsXml = batch.items.map((item, idx) => {
    const finalDays = item.managerDecision 
      ? item.managerDecision.finalApprovedDays 
      : (item.internalApprovedDays ?? item.billedDays);
    const unitRate = item.claimedDailyRate;
    const lineTotal = item.managerDecision 
      ? item.managerDecision.finalApprovedAmount 
      : +(finalDays * unitRate).toFixed(2);
    const managerNote = item.managerDecision 
      ? `Approved by ${item.managerDecision.decidedByName}: ${item.managerDecision.justificationNotes}`
      : 'Auto-cleared 100% timesheet match';

    return `        <ServiceEntrySheetItem lineNumber="${idx + 1}" quantity="${finalDays}">
          <ItemData>
            <ItemID>
              <SupplierPartID>${escapeXml(item.resourceEmail)}</SupplierPartID>
              <BuyerPartID>${escapeXml(item.projectCode || 'PRJ-SES-01')}</BuyerPartID>
            </ItemID>
            <Description xml:lang="en-US">Service Acceptance: ${escapeXml(item.resourceName)} (${escapeXml(item.resourceEmail)}) - Period: ${safeMonth}</Description>
            <UnitOfMeasure>DAY</UnitOfMeasure>
            <UnitPrice>
              <Money currency="${currency}">${unitRate.toFixed(2)}</Money>
            </UnitPrice>
          </ItemData>
          <SubtotalAmount>
            <Money currency="${currency}">${lineTotal.toFixed(2)}</Money>
          </SubtotalAmount>
          <Period startDate="${safeMonth}-01T00:00:00Z" endDate="${safeMonth}-28T23:59:59Z"/>
          <Comments xml:lang="en-US">${escapeXml(managerNote)}</Comments>
          <Extrinsic name="ResourceEmail">${escapeXml(item.resourceEmail)}</Extrinsic>
          <Extrinsic name="ResourceName">${escapeXml(item.resourceName)}</Extrinsic>
          <Extrinsic name="InternalApprovedDays">${item.internalApprovedDays}</Extrinsic>
          <Extrinsic name="VendorBilledDays">${item.billedDays}</Extrinsic>
          <Extrinsic name="SESLineStatus">ACCEPTED</Extrinsic>
        </ServiceEntrySheetItem>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.040/ServiceEntrySheet.dtd">
<cXML payloadID="SES-${safeCertId}@abcompany.com" timestamp="${timestamp}" xml:lang="en-US">
  <Header>
    <From>
      <Credential domain="NetworkID">
        <Identity>${safeVendor.replace(/[^a-zA-Z0-9]/g, '')}</Identity>
      </Credential>
      <Credential domain="Email">
        <Identity>${safeVendorEmail}</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkID">
        <Identity>AN01000000001-ABCOMPANY</Identity>
      </Credential>
      <Credential domain="CompanyID">
        <Identity>AB-COMPANY-GLOBAL-INC</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkID">
        <Identity>ABCOMPANY-SES-GATEWAY</Identity>
        <SharedSecret>ARIBAPICCSECURE2026</SharedSecret>
      </Credential>
      <UserAgent>AB Company Pre-Invoice Clearance Engine v2.4 (SAP Ariba SES Connector)</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="production">
    <ServiceEntrySheetRequest>
      <ServiceEntrySheetHeader
        serviceEntrySheetID="SES-${safePo}-${safeMonth}"
        serviceSheetDate="${timestamp}"
        operation="new">
        <ServiceEntrySheetHeaderIndicator/>
        <PartnerContact role="supplier">
          <Contact>
            <Name xml:lang="en-US">${safeVendor}</Name>
            <EmailAddress>${safeVendorEmail}</EmailAddress>
          </Contact>
        </PartnerContact>
        <PartnerContact role="approver">
          <Contact>
            <Name xml:lang="en-US">AB Company Project Governance Desk</Name>
            <EmailAddress>timesheets@abcompany.com</EmailAddress>
          </Contact>
        </PartnerContact>
        <Period startDate="${safeMonth}-01T00:00:00Z" endDate="${safeMonth}-28T23:59:59Z"/>
        <Comments xml:lang="en-US">Pre-Invoice Verified Service Entry Sheet for SAP Ariba automated clearance. Token: ${safeToken}</Comments>
        
        <!-- SAP Ariba Governance Reference Tokens -->
        <Extrinsic name="ServiceSheetStatus">APPROVED</Extrinsic>
        <Extrinsic name="PICC_CertificateId">${safeCertId}</Extrinsic>
        <Extrinsic name="PICC_SubmissionToken">${safeToken}</Extrinsic>
        <Extrinsic name="DigitalAuditHash">${safeHash}</Extrinsic>
        <Extrinsic name="TotalApprovedDays">${certificate.totalClearedDays}</Extrinsic>
      </ServiceEntrySheetHeader>

      <ServiceEntrySheetOrder>
        <OrderReference orderID="${safePo}">
          <DocumentReference payloadID="PO-${safePo}"/>
        </OrderReference>
      </ServiceEntrySheetOrder>

      <!-- Accepted Service Line Details -->
${sesItemsXml}

      <ServiceEntrySheetSummary>
        <SubtotalAmount>
          <Money currency="${currency}">${tax.netAmount.toFixed(2)}</Money>
        </SubtotalAmount>
        <Tax>
          <Money currency="${currency}">${tax.taxAmount.toFixed(2)}</Money>
          <Description xml:lang="en-US">${tax.isReverseCharge ? 'Reverse Charge Applicable' : `${tax.taxType} ${tax.taxRate}%`}</Description>
        </Tax>
        <GrossAmount>
          <Money currency="${currency}">${tax.grossAmount.toFixed(2)}</Money>
        </GrossAmount>
        <NetAmount>
          <Money currency="${currency}">${tax.netPayableAmount.toFixed(2)}</Money>
        </NetAmount>
      </ServiceEntrySheetSummary>
    </ServiceEntrySheetRequest>
  </Request>
</cXML>`;
}

/**
 * Escape XML special characters to produce valid XML
 */
function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  const str = String(unsafe);
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Triggers a direct browser file download for the cXML file
 */
export function downloadCxmlFile(filename: string, cxmlContent: string): void {
  const blob = new Blob([cxmlContent], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.cxml') ? filename : `${filename}.cxml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an official printable/downloadable standalone HTML/PDF document
 * for the Pre-Invoice Clearance Certificate.
 */
export function downloadCertificateDocument(batch: InvoiceBatch, certificate: PreInvoiceClearance): void {
  const currency = certificate.currency || 'USD';
  const rowsHtml = batch.items.map((item, idx) => {
    const finalDays = item.managerDecision 
      ? item.managerDecision.finalApprovedDays 
      : (item.internalApprovedDays ?? item.billedDays);
    const finalAmount = item.managerDecision 
      ? item.managerDecision.finalApprovedAmount 
      : +(finalDays * item.claimedDailyRate).toFixed(2);
    const signOff = item.managerDecision 
      ? `✓ Authorized by ${escapeXml(item.managerDecision.decidedByName)}<div style="color: #64748b; font-style: italic; font-size: 11px;">"${escapeXml(item.managerDecision.justificationNotes)}"</div>`
      : '<span style="color: #059669; font-weight: 600;">✓ 100% Timesheet Match</span>';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
        <td style="padding: 10px 12px;">
          <div style="font-weight: 700; color: #0f172a;">${escapeXml(item.resourceName)}</div>
          <div style="font-family: monospace; font-size: 11px; color: #64748b;">${escapeXml(item.resourceEmail)}</div>
        </td>
        <td style="padding: 10px 12px; text-align: center; font-weight: 600;">${item.billedDays}d</td>
        <td style="padding: 10px 12px; text-align: center; font-weight: 800; color: #059669;">${finalDays}d</td>
        <td style="padding: 10px 12px; text-align: right;">${formatCurrency(item.claimedDailyRate, currency)}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a;">${formatCurrency(finalAmount, currency)}</td>
        <td style="padding: 10px 12px; font-size: 11px;">${signOff}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AB Company PICC Certificate - ${escapeXml(batch.poNumber)}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      line-height: 1.5;
      margin: 0;
      padding: 30px;
      background: #f1f5f9;
    }
    .cert-container {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
    }
    .header-table { width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px; }
    .badge-cleared {
      display: inline-block;
      background-color: #d1fae5;
      color: #065f46;
      border: 1px solid #6ee7b7;
      border-radius: 9999px;
      padding: 4px 12px;
      font-weight: 700;
      font-size: 12px;
    }
    .grid-box {
      display: flex;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      justify-content: space-between;
    }
    .metric-card {
      flex: 1;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      margin-right: 16px;
    }
    .metric-card:last-child { margin-right: 0; background: #ecfdf5; border-color: #a7f3d0; }
    .token-box {
      background: #0f172a;
      color: #ffffff;
      border-radius: 12px;
      padding: 20px;
      margin-top: 24px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    th { background: #f1f5f9; color: #475569; text-transform: uppercase; font-size: 10px; font-weight: 700; padding: 10px 12px; text-align: left; }
    .btn-action {
      display: inline-block;
      padding: 10px 20px;
      background: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 20px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 900px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <strong>Pre-Invoice Clearance Certificate (PICC)</strong>
      <span style="color: #64748b; font-size: 13px; margin-left: 8px;">Official SAP Ariba PO Invoice Attachment Document</span>
    </div>
    <button onclick="window.print()" class="btn-action" style="margin-bottom: 0;">🖨️ Print or Save as PDF</button>
  </div>

  <div class="cert-container">
    <table class="header-table">
      <tr>
        <td style="vertical-align: top;">
          <div style="font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a;">AB COMPANY GLOBAL INC.</div>
          <div style="font-size: 13px; color: #64748b; font-weight: 500;">Corporate Accounts Payable & Invoicing Governance</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">100 Technology Plaza, Suite 400 • New York, NY 10001 • ap-reconcile@abcompany.com</div>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <div class="badge-cleared">✓ PRE-INVOICE CLEARED</div>
          <div style="font-family: monospace; font-size: 12px; color: #475569; margin-top: 8px; font-weight: 700;">
            PICC ID: ${escapeXml(certificate.certificateId)}
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
            Issued: ${new Date(certificate.issuedAt).toLocaleDateString()}
          </div>
        </td>
      </tr>
    </table>

    <div class="grid-box">
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700;">Purchase Order</div>
        <div style="font-size: 16px; font-weight: 800; font-family: monospace;">${escapeXml(batch.poNumber)}</div>
      </div>
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700;">Vendor Organization</div>
        <div style="font-size: 14px; font-weight: 700;">${escapeXml(batch.vendorName)}</div>
      </div>
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700;">Billing Period</div>
        <div style="font-size: 14px; font-weight: 700;">${escapeXml(batch.billingMonth)}</div>
      </div>
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700;">Currency</div>
        <div style="font-size: 14px; font-weight: 700;">${escapeXml(currency)}</div>
      </div>
    </div>

    <div style="display: flex; margin-bottom: 24px;">
      <div class="metric-card">
        <div style="font-size: 12px; color: #64748b; font-weight: 600;">Total Cleared Days</div>
        <div style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 4px 0;">${certificate.totalClearedDays} Days</div>
        <div style="font-size: 11px; color: #64748b;">Cross-verified with central internal timesheets</div>
      </div>

      <div class="metric-card">
        <div style="font-size: 12px; color: #065f46; font-weight: 600;">Total Cleared Billing Amount</div>
        <div style="font-size: 26px; font-weight: 900; color: #047857; margin: 4px 0;">${formatCurrency(certificate.totalClearedAmount, currency)}</div>
        <div style="font-size: 11px; color: #065f46;">Authorized for invoice posting in SAP Ariba</div>
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">
        Reconciliation Line-Item Audit Schedule
      </div>
      <table border="0">
        <thead>
          <tr>
            <th>Resource & Email</th>
            <th style="text-align: center;">Billed</th>
            <th style="text-align: center;">Approved</th>
            <th style="text-align: right;">Rate / Day</th>
            <th style="text-align: right;">Cleared Amount</th>
            <th>Manager Sign-Off Rationale</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <div class="token-box">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <div style="font-size: 11px; font-weight: 800; color: #34d399; text-transform: uppercase; letter-spacing: 1px;">
            Mandatory SAP Ariba Submission Token
          </div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
            Must be copied into the PreClearanceReference field upon invoice submission.
          </div>
        </div>
        <div style="background: #1e293b; padding: 8px 16px; border-radius: 8px; border: 1px solid #334155; font-family: monospace; font-size: 15px; font-weight: 700; color: #34d399;">
          ${escapeXml(certificate.aribaSubmissionCode)}
        </div>
      </div>
      <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #334155; padding-top: 10px;">
        <strong>Instructions for Accounts Receivable:</strong> Attach this certificate to your SAP Ariba invoice submission. Invoices submitted without matching pre-cleared days or valid token will be rejected by AB Company's ERP robot.
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
      <div>
        <strong>Audit Hash:</strong> <span style="font-family: monospace;">${escapeXml(certificate.verificationAuditHash)}</span>
      </div>
      <div>
        Generated by AB Company Internal Pre-Invoice Clearance Engine
      </div>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `AB_PICC_Clearance_${batch.poNumber}_${certificate.certificateId}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
