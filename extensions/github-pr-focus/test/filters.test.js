const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFileCategory,
  isMockFile,
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

test("splits generated and hand-written mocks from source and tests", () => {
  const categories = new Map([
    ["core/jobfork/mocks/mock_jobfork.go", "mocks"],
    ["internal/httpapi/mocks/mock_clerk.go", "mocks"],
    ["src/__mocks__/axios.ts", "mocks"],
    ["tests/mocks/client.py", "mocks"],
    ["pkg/store/store_mock.go", "mocks"],
    ["src/api.mock.ts", "mocks"],
    ["app/mock_server.py", "mocks"],
    ["tests/fixtures/mocks/user.json", "artifacts"],
    ["src/hammock.ts", "source"],
    ["src/mockingbird.go", "source"],
    ["src/api.mock.test.ts", "tests"],
  ]);

  for (const [filePath, category] of categories) {
    assert.equal(getFileCategory(filePath), category, filePath);
  }
  assert.equal(isMockFile("internal/specification/parser.go"), false);
});
