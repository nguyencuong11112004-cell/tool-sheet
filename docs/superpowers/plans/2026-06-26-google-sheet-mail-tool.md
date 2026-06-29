# Google Sheet Mail Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static browser tool that reads a public Google Sheet, searches rows by name, generates recovery email addresses, and exposes copy/next controls.

**Architecture:** Put testable account and sheet logic in `app.js`, exported as ES module functions. Keep `index.html` as the browser UI shell and let `app.js` attach event handlers when the DOM is available.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node built-in `node:test`.

---

### Task 1: Add Logic Tests

**Files:**
- Create: `tests/app.test.js`

- [ ] **Step 1: Write failing tests**

Create tests for Google Sheet URL conversion, CSV parsing, accent-insensitive name search, recovery email generation, and 500-row domain rotation.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/app.test.js`

Expected: fail because `app.js` does not exist yet.

### Task 2: Implement Pure Logic

**Files:**
- Create: `app.js`

- [ ] **Step 1: Add exported functions**

Implement `toCsvUrl`, `parseCsv`, `normalizeText`, `findHeader`, `mapRows`, `getRecoveryDomain`, `createRecoveryEmail`, and `filterByName`.

- [ ] **Step 2: Run tests to verify pass**

Run: `node --test tests/app.test.js`

Expected: all tests pass.

### Task 3: Build Browser UI

**Files:**
- Modify: `index.html`
- Modify: `app.js`

- [ ] **Step 1: Add static UI**

Create controls for sheet URL, load button, search field, current result card, copy buttons, next-row button, results table, and status message.

- [ ] **Step 2: Add DOM wiring**

Load CSV through `fetch`, parse rows, render filtered results, copy values with `navigator.clipboard`, and cycle selected results with the next button.

- [ ] **Step 3: Verify manually**

Open `index.html` in a browser. Use a public Google Sheet link, search a name, copy fields, and move to the next row.

### Task 4: Final Verification

**Files:**
- Read: `docs/superpowers/specs/2026-06-26-google-sheet-mail-tool-design.md`
- Read: `docs/superpowers/plans/2026-06-26-google-sheet-mail-tool.md`

- [ ] **Step 1: Run automated tests**

Run: `node --test tests/app.test.js`

Expected: all tests pass.

- [ ] **Step 2: Review requirement coverage**

Confirm every requested behavior is implemented in `index.html` and `app.js`.
