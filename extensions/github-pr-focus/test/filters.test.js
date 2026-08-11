const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFileCategory,
  isTestArtifact,
  isTestFile,
  normalizeFilePath,
} = require("../src/filters.js");

test("recognizes common test files and directories", () => {
  const testFiles = [
    "api/handler_test.go",
    "src/button.spec.tsx",
    "src/button.test.js",
    "tests/test_checkout.py",
    "packages/web/__tests__/header.tsx",
    "e2e/login-flow.ts",
    "playwright.config.ts",
    "snapshots/card.snap",
    "internal/mocks/store.go",
    "internal/gateway/mock_client.go",
    "internal/gateway/client_mock.go",
    "pkg/store/mocks.go",
  ];

  for (const filePath of testFiles) {
    assert.equal(isTestFile(filePath), true, filePath);
  }
});

test("does not hide production files with test-like words", () => {
  const sourceFiles = [
    "src/testing-utils.ts",
    "src/contest.ts",
    "src/latest.py",
    "docs/testing-strategy.md",
    "docs/specs/architecture.md",
    "app/testimonials/page.tsx",
    "internal/specification/parser.go",
    "internal/mockingbird/service.go",
    "pkg/mockable/iface.go",
    "src/mocking.go",
    "src/mockClient.ts",
  ];

  for (const filePath of sourceFiles) {
    assert.equal(isTestFile(filePath), false, filePath);
  }
});

test("normalizes URL-encoded paths", () => {
  assert.equal(
    normalizeFilePath("/src/button%20group.test.tsx?diff=split#L20"),
    "src/button group.test.tsx",
  );
});

test("removes GitHub's bidirectional path markers", () => {
  assert.equal(
    normalizeFilePath("\u200etemplates/backend/tests/conftest.py\u200e"),
    "templates/backend/tests/conftest.py",
  );
});

test("splits config, migrations, and test artifacts from source code", () => {
  const categories = new Map([
    ["src/app.go", "source"],
    ["config/app.json", "config"],
    ["deploy/values.yaml", "config"],
    ["db/migrations/001_create_users.sql", "migrations"],
    ["tests/parser_test.go", "tests"],
    ["tests/config.yaml", "tests"],
    ["tests/schema.sql", "tests"],
    ["tests/fixtures/user.json", "artifacts"],
    ["pkg/__snapshots__/output.snap", "artifacts"],
    ["testdata/golden-response.json", "artifacts"],
  ]);

  for (const [filePath, category] of categories) {
    assert.equal(getFileCategory(filePath), category, filePath);
  }
  assert.equal(isTestArtifact("tests/fixtures/user.json"), true);
  assert.equal(isTestFile("tests/fixtures/user.json"), true);
});

test("counts generated Go mocks as tests", () => {
  const categories = new Map([
    ["internal/mocks/store.go", "tests"],
    ["mocks/billing/InvoiceService.go", "tests"],
    ["internal/mock/db.go", "tests"],
    ["internal/mock_store/store.go", "tests"],
    ["internal/store_mocks/store.go", "tests"],
    ["internal/gateway/mock_client.go", "tests"],
    ["internal/gateway/mock_client_v2.go", "tests"],
    ["internal/gateway/client_mock.go", "tests"],
    ["pkg/store/mocks.go", "tests"],
    ["testdata/mocks/store.go", "artifacts"],
    ["mocks/responses.json", "config"],
    ["internal/mockingbird/service.go", "source"],
  ]);

  for (const [filePath, category] of categories) {
    assert.equal(getFileCategory(filePath), category, filePath);
  }
  assert.equal(isTestArtifact("internal/mocks/store.go"), false);
});
