# Light/dark mode and reports — 0.7.0

## Theme selection

The bottom-right Theme selector is available on public, authentication, setup, invitation and workspace pages. Choose Light, Dark or System. System is the default and follows the device's preferred color scheme, including subsequent changes. The selection is stored only in `localStorage["monethakbe-theme"]`; it contains no account, family or financial data and is not a server-side profile setting. Browser tabs synchronize changes. Clearing storage restores System. If storage access is blocked, changes still work for the current page but may not survive reload.

The small theme bootstrap executes before body paint to apply a saved preference without an initial light-background flash. It uses the application's existing inline-script CSP allowance; no additional policy weakening is introduced. The selected color scheme also applies to browser-native inputs. Shared variables and explicit surface/text overrides cover the dashboard, forms, dialogs, reminders, document lists, home page and installation footer. The supplied logo retains its original colors and pale background; it is not inverted or edited.

Theme logic is tested with simulated browser events/storage. Real-device screenshots, browser rendering, screen-reader review and full WCAG conformance remain deployment verification. Check all pages and dialogs in both modes, including narrow mobile widths. Theme selection is intentionally separate from Simple/Advanced display mode.

## Reports and exports

In Settings, use **Reports and CSV**. Report generation, CSV download and Print/save PDF each make a new permission-checked server request. Only records with both View and Export permission are included. A member with no eligible records receives a permission error, except owner/administrator roles may receive an empty report. Explicit deny rules still apply to those roles. Reports are scoped to one family and to the requesting member, so they may differ from the on-screen dashboard, which includes all viewable records.

Choose asset/liability/all, a category, and whether archived rows should be included. The report provides:

- Active record count and unknown-value count.
- Exact included asset value, outstanding liabilities and estimated net worth in BDT.
- Category totals and record-level whole values/balances, shares, included values and valuation/balance dates.
- Report generation time in the Bangladesh time zone and explicit filter/scope information.

Current financial exports use a repeatable-read transaction so their multi-query snapshot is consistent. Each successful source export records the existing `records.exported` audit event. This is current-state reporting, not historical net-worth reconstruction or legal/financial verification.

Asset included value is whole-asset value multiplied by family economic share exactly once. Liabilities are the family's recorded balance, deducted directly. Totals are accumulated with exact decimals and then rounded to two places. Displayed individual included rows are rounded separately, so summing the displayed rows can differ slightly from the full-precision aggregate. Unknown amounts are blank/dashes and counted as unknown. Archived rows are excluded from all totals even when included in the table. A filtered report's net worth describes that filter only, not necessarily the whole family's position.

The on-screen detail preview shows at most 100 rows and discloses the limit. CSV and print include every eligible selected row. The endpoint rejects source exports above 5,000 exportable records without truncation; larger asynchronous reports remain future work. Record/category loading still follows the existing small-family architecture.

## CSV behavior

CSV uses UTF-8 with BOM, CRLF row separators, and quoted/escaped cells for Bengali text, commas, quotes and line breaks. Text starting with spreadsheet formula markers (including whitespace/control prefixes) is prefixed with an apostrophe. This deliberately changes potentially executable cell content into text. Monetary source cells are exact decimal strings; spreadsheet programs can still apply their own formatting/number precision when opening a CSV, so import identifiers as text if necessary.

Columns include identifiers, kind/name/category/type, BDT values, family share, dates, archive status, location/lender, notes, details JSON and ownership JSON. Unknown values remain empty. The CSV contains current permitted data only; it does not include payment/valuation histories, document bytes, reminders or an account-restorable database archive. Store downloaded files privately.

The previous current-record JSON export remains available. Neither export is a full backup or automatic restore format.

## Print / save PDF

Print/save PDF fetches fresh authorized data and opens the browser's print dialog. Select Save as PDF when supported by your browser. This does not create a server-generated PDF or require a PDF service. The print layout uses a white background and dark text regardless of the selected theme, hides app navigation/controls, repeats table headers where supported and includes all selected rows. React renders record strings as text; report content is not interpolated into executable HTML.

Use print preview to verify page breaks, Bengali glyphs and paper size before sharing. Font availability and PDF behavior depend on the user's browser/device. Real-browser printing and lengthy-report pagination have not been verified in this implementation environment. The app cannot recall files already downloaded or printed; permission changes apply to subsequent requests.

## API

`POST /api/families/:familyId/reports`

```json
{"kind":"all","category":"","includeArchived":false,"format":"json"}
```

All fields have the displayed defaults. `format` accepts `json` (summary and rows) or `csv` (attachment). Unknown fields, including historical `asOf`, are rejected. Authentication, active membership and the existing same-origin mutation check apply. Responses are no-store. The underlying export permission filters are reused rather than implemented independently in the browser.

## Still remaining

Historical net-worth and trend reports, history/ledger exports, asynchronous large reports, automated scheduled reports, server-generated PDF files, full backup/restore, AI features and Drive integration remain separate future increments.
