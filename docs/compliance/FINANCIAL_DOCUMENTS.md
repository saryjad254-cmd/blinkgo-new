# BlinkGo financial documents

## Current launch state

BlinkGo currently issues two immutable operational documents:

- `customer_receipt`: an order receipt, explicitly not a tax invoice.
- `merchant_transaction_statement`: a per-order preliminary transaction statement, explicitly not a payout confirmation or tax invoice.

Each document is numbered once, stores a canonical JSON snapshot, stores a SHA-256 digest and is never recalculated on later catalog/config changes. Customer and merchant downloads are owner-scoped and audited.

## Why tax-invoice mode is disabled

The platform operator is not yet registered as a legal business and production tax identifiers are not available. Calling these documents invoices would be misleading. Before enabling a German `Rechnung`, obtain accountant/legal approval and configure at minimum:

- full legal issuer and recipient identity/address where required;
- Steuernummer or USt-IdNr.;
- unique sequential invoice number;
- issue date and supply/service date;
- item/service description and quantities;
- net amounts split by tax rate, reductions, tax rate and tax amount or exemption notice;
- correction/credit-note process without mutating an issued document;
- retention, availability and machine-readable export controls;
- B2B e-invoice transition plan.

Authoritative references checked 2026-08-12:

- § 14 UStG: https://www.gesetze-im-internet.de/ustg_1980/__14.html
- § 33 UStDV (small-value invoices up to EUR 250): https://www.gesetze-im-internet.de/ustdv_1980/__33.html
- § 147 AO (bookkeeping-document retention): https://www.gesetze-im-internet.de/ao_1977/__147.html

This document is engineering readiness guidance, not legal or tax advice.
