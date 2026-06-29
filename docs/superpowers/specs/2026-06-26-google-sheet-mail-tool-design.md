# Google Sheet Mail Tool Design

## Goal

Build a browser tool that reads a public Google Sheet link, searches account rows by name, and provides copy buttons for email, password, and generated recovery email.

## Scope

The tool runs from local static files. It accepts a public Google Sheet URL and converts it to a CSV export URL. It expects columns named like `Ten` or `Tên`, `email`, `mat khau` or `mật khẩu`, and `mail khoi phuc` or `mail khôi phục`.

## Behavior

- Load a public Google Sheet as CSV.
- Parse rows into account records.
- Search rows by the name column, case-insensitive and accent-insensitive.
- Show the currently selected row with email, password, and recovery email.
- If recovery email is empty, generate one from the email username plus a random number and one of these domains: `clowmail.com`, `gimpmail.com`, `givmail.com`, `tupmail.com`.
- Use one domain per 200 source rows, then move to the next domain and loop after the fourth domain.
- Provide copy buttons for email, password, and recovery email.
- Provide a next-row button to move through matching search results.

## Files

- `index.html`: UI markup and styling for the tool.
- `app.js`: CSV parsing, Google Sheet URL conversion, search, recovery email generation, and DOM wiring.
- `tests/app.test.js`: Node tests for the pure logic.

## Error Handling

The UI shows a clear message if the link is invalid, the sheet cannot be loaded, the CSV has no usable rows, or no matching name is found.

## Testing

Use Node's built-in test runner for the pure logic. Manual browser verification will cover loading the page, entering a sheet link, searching, copying, and moving to the next row.
