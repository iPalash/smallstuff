# Chrome Web Store listing

## Name

GitHub PR Focus

## Summary

Focus GitHub pull request diffs with category filters and split line counts.

## Description

GitHub PR Focus makes large pull requests easier to review by separating the
combined line count into useful change categories. Click one or more categories
to show only the parts of the diff you want to review, without leaving GitHub's
Files changed page.

Use Code, Comments, Tests, Config, Migrations, and Artifacts independently or
combine them—for example, Code + Config. Hidden files disappear from both the
diff and file tree, and the displayed line totals reflect the visible category
breakdown.

Key features:

- Multi-select focus filters directly in the pull-request header
- Separate additions and deletions for every category
- Source-code comments counted independently from executable code
- Generated Go mocks such as `mock_*.go` and `mocks/` grouped with Tests
- JSON, JSONC, YAML, and YML grouped as Config
- SQL files grouped as Migrations
- Snapshots, fixtures, golden files, cassettes, recordings, and testdata grouped
  as Artifacts
- GitHub's native whitespace-only change filter enabled by default
- Preferences saved with Chrome Sync
- No analytics, external requests, or collection of pull-request content

The extension runs only on GitHub pull-request pages and supports both the
current `/changes` interface and the legacy `/files` interface.

## Category

Developer Tools

## Language

English

## Single purpose

Help developers focus GitHub pull-request reviews by classifying changed files
and lines into selectable categories.

## Permission justification

`storage` saves only the user's selected focus categories through Chrome Sync so
the same review preference can persist across GitHub pull-request pages. It does
not store pull-request filenames, source code, comments, URLs, or line counts.

## Privacy practices

- Personally identifiable information: not collected
- Health information: not collected
- Financial and payment information: not collected
- Authentication information: not collected
- Personal communications: not collected
- Location: not collected
- Web history: not collected
- User activity: not collected
- Website content: processed locally to classify the visible GitHub diff; not
  retained or transmitted

The extension does not sell data, use data for advertising or creditworthiness,
or transfer data to third parties. Its use of website content is limited to the
user-facing diff filtering feature described in this listing.

## Reviewer instructions

1. Install the extension and open any GitHub pull request with changed files.
2. Open the Files changed view (`/changes` or `/files`).
3. Click the Code, Comments, Tests, Config, Migrations, or Artifacts chips beside
   the line total.
4. Select multiple chips to compose a view; click a selected chip to remove it.
5. Verify excluded files are hidden from both the diff and left file tree.

No account beyond normal GitHub access is required. A pull request containing a
mix of source, test, JSON/YAML, SQL, and fixture files demonstrates all
categories.

## Distribution

Public
