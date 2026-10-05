# GitHub PR Focus

A small Chrome extension that adds focusable change categories to a GitHub pull
request's **Files changed** page. Selections are stored with Chrome sync and
continue to work as GitHub loads more files or navigates without a full page
refresh.

The pull-request header replaces GitHub's combined line total with a breakdown
for **Code**, **Comments**, **Tests**, **Mocks**, **Config**, **Migrations**,
and test **Artifacts**. Files under `mocks/`, `mock/`, or `__mocks__/`, and
files named like `mock_*.go`, `*_mock.go`, or `*.mock.ts`, count as Mocks. JSON, JSONC, YAML, and YML files count as Config; SQL counts as
Migrations. Snapshots, golden files, fixtures, recordings, cassettes, and
`testdata` paths count as Artifacts. A category excluded by the active filters
is muted and struck through. An **Other** category appears only if GitHub has not
yet loaded enough file metadata to classify every changed line.

Click one or more categories to compose a focused view, such as **Code +
Config**. Click selected categories again to remove them; clearing the final
selection returns to the full diff. GitHub's gear menu is left unchanged.

Whitespace-only changes are hidden by default. When a pull-request diff opens,
the extension preserves the existing URL options and enables GitHub's native
`w=1` diff mode if it is not already active.

The extension supports both GitHub's current `/changes` interface and the
legacy `/files` interface.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `github-pr-focus` directory.
5. Open a pull request and choose **Files changed**.

Reload an already-open GitHub tab once after installing the extension.

## Test-file detection

The extension recognizes common conventions including `tests/`, `test/`,
`__tests__/`, `spec/`, `e2e/`, Cypress, `*_test.go`, `test_*.py`,
`*.test.tsx`, `*.spec.js`, and popular test-runner config files. Test fixtures,
snapshots, golden files, recordings, and cassettes are classified separately as
Artifacts.

## Development

The extension has no runtime dependencies or build step. To run its tests:

```bash
npm install
npm test
```
