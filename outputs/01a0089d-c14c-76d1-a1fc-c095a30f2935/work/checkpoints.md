# Task 1 checkpoints

## 2026-08-16 — source-data contract

- RED: `node --test tests/source_reader.test.mjs` failed as expected before implementation with `ERR_MODULE_NOT_FOUND` for `model/constants.mjs`.
- GREEN: `node --test tests/source_reader.test.mjs` passed 4/4 tests: approved 26-city list, approved 12-sheet list, normalization of blank rows/numeric blanks/DC+AC gun count/raw row numbering, and required `RawRecord` field order.
- Source render: `node model/render_source_baseline.mjs` imported `Data List!A1:P3050` (3,050 rows × 16 columns) through `@oai/artifact-tool` and wrote `previews/source-data-list.png`.
- Visual review: `Data List` is a single-layer raw data table with one header row and day/station records. It has no complex model formatting that downstream workbook sheets must inherit. The displayed columns are order creation date, station ID/name, DC/AC gun count, charging/period kWh, minutes, gross, electricity fee, service fee, and report date.
- Note: Rendering completed successfully but took approximately 239 seconds for this source workbook; this is a performance characteristic only, not a correctness issue.

# Task 10 checkpoints

## 2026-08-17 — final verification, rendering, export, and reimport

### Automated verification

- Baseline full serial suite on `c5e51be`: 99 tests, 97 passed, 0 failed, 2 explicitly skipped; 522.9s. The skipped tests are opt-in Task 9 real-source/render duplicates; the same run included the real historical-source and real workbook audits.
- Upstream visual/formula correction `d25c37e`: focused tests 2/2 passed before handoff. Post-review current-HEAD rerun of those two contracts passed 2/2 in 28.8s: representative historical dates/blanks and matching `yyyy-mm` deployment headers.
- Post-review current-HEAD Task 9 formula suite: 7 passed, 0 failed, 2 explicitly skipped in 37.3s.
- Post-review current-HEAD pure-engine quick regression: 74/74 passed in 0.4s.
- RED evidence for the post-commit review: the former single inspect of `36月运营模型!A1:BI35` returned only the A1 title and NDJSON `valuesTruncated:true`; the completeness assertion exited 1. Both chart gates also still used `>= 5` and failed the exact-five source assertion.
- GREEN existing-XLSX verification: exit code 0 in 60.2s; all six key ranges were divided into 10-row by 8-column safe blocks (165 blocks total), every metadata object and NDJSON record was parsed, no block was empty or truncated, 9/9 assertions passed, the formula-error scan was clean, and the peak funding gap serial displayed as `2026-11`.
- Final release rebuild on `3a796ef`: one loader-provided Node process with an 8,192 MB heap, `--expose-gc`, and the documented skip-trace reason completed the audited-manifest load, workbook build, all checks, 12 renders, export, and reimport in 328s. The command's truthful outer exit code was 1 solely because artifact-tool emitted its automatic `.inspect.ndjson` sidecar; the workbook and complete verification log were written successfully.
- Current release gate: a separate import of the newly exported XLSX completed with exit code 0 in 35.1s. All 9 assertions passed, including 17/17 visible checks, overall `B19=PASS`, exactly five native charts, 165/165 complete reimport blocks, one XLSX in the output root, and a clean scan including `#NUM!`.

### Key ranges and finance checks

- Inspected: `融资摘要!A1:R45`, `核心假设!A1:M65`, `历史单枪模型!A1:M80`, `36月运营模型!A1:BI35`, `融资租赁与资金缺口!A1:BI80`, and `情景分析、检查与来源!A1:I120`.
- The finalizer records separate `preExportKeyInspections` and `reimportKeyInspections`. Each block must return matching address, exact row/column counts, a complete values matrix, nonempty NDJSON and metadata, and no `truncated`/`valuesTruncated` flag. The current release rebuild proved 165/165 pre-export blocks and 165/165 reimport blocks.
- Pre-export audit: 46/46 PASS. Post-export reimport audit: 46/46 PASS.
- Visible workbook checks: `情景分析、检查与来源!F22:F38` = 17/17 PASS; overall `B19` = PASS.
- Formula-error scans before export, after reimport, and in the independent existing-file verification found none of `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`, or `#NUM!`.
- Finance audit passed historical gross-fee split, 30,000-gun allocation and station mix, capex/eligible-basis/channel split, disbursement rate, supplier-payable roll-forward, rent decomposition, every cohort and aggregate lease ending at zero, ratio-of-sums DSCR, and exclusion of minimum equity from ordinary operating income.
- Summary reconciliations: 30,000 guns; total investment RMB 640,300,000; lease disbursement RMB 543,300,000; minimum equity/peak gap RMB 229,020.49 in `2026-11`; full-cycle DSCR 3.2105x; minimum monthly DSCR 1.8551x; three-year lease balance RMB 141,715,483.68.
- Trace limitation: actual `workbook.trace()` expansion was attempted on the real workbook and exhausted both 4,096 MB and 8,192 MB Node heaps after clean pre-export audits. The API exposes no node/depth cap. All three requested trace targets are therefore recorded as `UNAVAILABLE` with the observed resource failure; no trace result was fabricated.

### Visual review — 12/12 sheets

- The final release generated 12 fresh previews. After the earlier 12/12 review, the current build was visually rechecked in `融资摘要`, `核心假设`, `城市分配`, `月度投放计划`, `历史单枪模型`, `融资租赁与资金缺口`, and `情景分析、检查与来源`; the new manifest and invalid-input gates caused no layout regression.

- `融资摘要`: KPI block, underwriting warning, five native charts, axes, legends, and titles are readable with no overlap.
- `核心假设`: input colors, units, 12-month rollout, and six-month ramp blocks are readable.
- `城市数据库`: wide/dense source table is intentionally compact; title/header bands and source columns remain visible at zoom.
- `城市分配`: fixed-city ordering, allocation, station mix, and cohort helper columns are aligned and readable.
- `月度投放计划`: both two-gun and four-gun month headers render as `yyyy-mm`; no Excel serial headers remain.
- `单站成本`: equipment, engineering, channel, total, eligible basis, and per-gun values are unclipped.
- `历史原始数据`: first 50 source rows render with readable headers and numeric formats.
- `历史单枪模型`: first/last operating dates render as real dates; no `#NUM!` or `1900-01-00` remains.
- `年度季节曲线`: monthly inputs, unit curve, seasonality index, source IDs, and source-period helper are readable.
- `36月运营模型`: full 60-month timeline is present, with formal-report and gray debt-tail regions distinguishable.
- `融资租赁与资金缺口`: cohort metadata, amortization matrices, 60-month cash/debt rows, and tail shading render without structural overlap.
- `情景分析、检查与来源`: scenario table, 17 checks, external scan gate, and 60-month helper area render; long helper grid is intentionally zoom-dense.

### Export evidence

- Artifact-tool-only export used `SpreadsheetFile.exportXlsx(workbook)` followed by `output.save(PATHS.outputWorkbook)`.
- Artifact tool intentionally attached a 40,907,542-byte full-workbook `.inspect.ndjson` sidecar during export. It was moved to ignored evidence at `work/final-export-inspect-3a796ef.log`; the output directory contains exactly one `.xlsx`.
- Final workbook: `D:/Project_Mini_Charge_Station/outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁模型.xlsx`, 913,706 bytes, SHA-256 `1F354802E0766EBD4E840B523294935D784DE47EF38F5A13D91F5421544D2164`.
- Reimport preserved all 12 approved sheets in order, 17/17 checks, overall PASS, exactly five summary charts, fixed historical dates, formatted deployment headers, and clean formula scan.
