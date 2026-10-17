# Documentation

Mode: Read. Target: `app/frontend/public/guide.html`. Route: `/guide`. The public navigation label is Docs in `home.html` and `App.jsx`; `/docs` remains the interactive API reference. Scope is desktop, explicitly requested by the user.

## Direction contract

This is an ordinary extension of ResponseWatch’s incumbent visual system. The reader should understand how to use the dashboard, interpret its evidence, and prepare data without losing their place. Preserve the teal identity, system sans typography, navy ink, cool neutral ground, white surfaces, thin seams, restrained corners and visible blue keyboard focus documented in `DESIGN.md`. No replacement visual world or system-token update is required.

The Read composition deliberately uses more generous type, line-height and prose measure than the compact Operate dashboard. A white reading shell contains a searchable left contents rail and long-form sections on the right. On desktop, the page header and contents remain sticky while the document scrolls. Teal wash identifies the active contents item; section seams, headings, lists and tables establish hierarchy without decorative imagery or floating cards. Existing local token differences are outside this extension’s repair scope.

## Content and source authority

Cover overview, dashboard workflow, datasets and controls, metrics and judgments, CSV uploads, methods and assumptions, limitations, and references. Keep initial explanations readable; formulas, validity checks, worked examples and developer setup belong in native expandable disclosures. The project README is the source of truth for setup and architecture; `data/CODEBOOK.md` owns variable definitions and CSV semantics. Link both directly, alongside generation notes, the tested `app/qc.py` implementation, API contract and demo walkthrough.

Explain existing statistical behavior without changing calculations, thresholds, fixtures or data. Distinguish target failure from own-baseline deterioration, descriptive stage comparisons from statistical signals, and unavailable evidence from zero. Preserve synthetic historical-cohort disclosure and the separation between response duration and preceding call handling.

## Functional contract

Search filters top-level sections and their contents links using all entered terms, case-insensitively, including text inside disclosures. Matching sections open their disclosures during search; clearing restores initial disclosure states. A live result count, explicit no-results state, Clear control and Escape reset support recovery. Contents links navigate to section anchors, the active item tracks visible sections, and deep links reveal disclosure ancestors. A skip link, labeled search input, native disclosure controls and visible keyboard focus support navigation.

## Verification boundary

Implementation evidence is in `guide.html`: sticky header/contents CSS, semantic section anchors, native `details` elements, `filterDocs`, hash navigation and `IntersectionObserver` contents tracking. Browser verification belongs to the parent implementation pass; this brief does not claim an independent runtime test. Desktop reading and search/navigation behavior are the acceptance scope. Existing narrow-screen fallbacks are retained, with no mobile redesign requested.

## System documentation boundary

Only this surface brief is added for the extension. `PRODUCT.md`, root `DESIGN.md` and `.impeccable/design.json` retain their existing authority and content. No statistics are changed by this documentation pass.
