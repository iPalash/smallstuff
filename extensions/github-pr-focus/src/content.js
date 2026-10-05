(function initializeGitHubPrFocus() {
  "use strict";

  const filters = globalThis.GitHubPrFocusFilters;
  if (!filters) return;

  const STORAGE_KEY = "githubPrFocusSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    focusCategories: [],
  });
  const FOCUS_CATEGORY_ORDER = [
    "code",
    "comments",
    "tests",
    "mocks",
    "config",
    "migrations",
    "artifacts",
  ];
  const FOCUS_CATEGORIES = new Set(FOCUS_CATEGORY_ORDER);
  const reloadPage =
    globalThis.GitHubPrFocusTestHooks?.reloadPage || (() => location.reload());

  const FILE_SELECTOR = [
    ".js-file",
    "[role='region'][id^='diff-']",
    "[data-testid='file-diff']",
    "[data-testid='file-diff-container']",
    "[data-file-path]",
  ].join(",");

  const SOURCE_DIRECTIVE_PATTERN = /^(?:\/\/\s*(?:go:|nolint\b|lint:|line\b|eslint\b|@ts-)|#\s*(?:noqa\b|type:|pragma:|pylint:|ruff:|fmt:|nosec\b|shellcheck\b)|\/\*\s*(?:eslint|prettier)|<!--\s*(?:eslint|prettier|svelte|vue))/i;

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    scheduled: false,
  };

  const observer = new MutationObserver(scheduleRefresh);

  function isFilesPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+\/(?:changes|files)(?:\/|$)/.test(
      location.pathname,
    );
  }

  function ensureWhitespaceHidden() {
    if (!isFilesPage()) return false;

    const url = new URL(location.href);
    if (url.searchParams.get("w") === "1") return false;

    url.searchParams.set("w", "1");
    history.replaceState(history.state, "", url);
    reloadPage();
    return true;
  }

  function getViewSettings() {
    const focusCategories = new Set(state.settings.focusCategories);
    const hasFocus = focusCategories.size > 0;
    return {
      focusCategories,
      hasFocus,
      hideCode: hasFocus && !focusCategories.has("code"),
      hideCodeComments: hasFocus && !focusCategories.has("comments"),
    };
  }

  function hasValidExtensionContext() {
    try {
      if (!chrome.runtime) return true;
      if (!chrome.runtime.id) return false;
      chrome.runtime.getManifest?.();
      return true;
    } catch (_error) {
      return false;
    }
  }

  function isExtensionContextInvalidated(error) {
    return String(error?.message || error).includes(
      "Extension context invalidated",
    );
  }

  function deactivate() {
    observer.disconnect();
    try {
      removeFilters();
    } catch (_error) {
      // Cleanup is best-effort once Chrome has invalidated the isolated world.
    }
  }

  function saveSettings() {
    if (!hasValidExtensionContext()) {
      deactivate();
      return;
    }
    try {
      const pending = chrome.storage.sync.set({
        [STORAGE_KEY]: { ...state.settings },
      });
      pending?.catch?.(deactivate);
    } catch (_error) {
      deactivate();
      return;
    }
    refresh();
  }

  function setClass(element, className, enabled) {
    if (element.classList.contains(className) === enabled) return;
    element.classList.toggle(className, enabled);
  }

  function readFilePath(file) {
    const directPath =
      file.getAttribute("data-path") || file.getAttribute("data-file-path");
    if (directPath && !directPath.includes("{{")) return directPath;

    const pathElement = file.querySelector(
      "[data-path], [data-file-path], .file-info a[title], " +
        ".js-file-header a[title], h3 a[href^='#diff-'], [data-testid='file-name']",
    );
    if (!pathElement) return "";

    return (
      pathElement.getAttribute("data-path") ||
      pathElement.getAttribute("data-file-path") ||
      pathElement.getAttribute("title") ||
      pathElement.textContent ||
      ""
    ).trim();
  }

  function getFileCategory(file) {
    return filters.getFileCategory(readFilePath(file));
  }

  function isFileCategoryVisible(category, view) {
    if (!view.hasFocus) return true;
    if (category === "source") {
      return (
        view.focusCategories.has("code") ||
        view.focusCategories.has("comments")
      );
    }
    return view.focusCategories.has(category);
  }

  function isLineCategoryVisible(category, view) {
    if (category === "code") {
      return isFileCategoryVisible("source", view) && !view.hideCode;
    }
    if (category === "comments") {
      return (
        isFileCategoryVisible("source", view) && !view.hideCodeComments
      );
    }
    return isFileCategoryVisible(category, view);
  }

  function getFileDiffs() {
    const candidates = [...document.querySelectorAll(FILE_SELECTOR)];
    return candidates.filter(
      (candidate, index) =>
        !candidates.some(
          (other, otherIndex) =>
            otherIndex !== index && other.contains(candidate),
        ),
    );
  }

  function getFileHideTarget(file) {
    if (
      file.matches("[role='region'][id^='diff-']") &&
      file.parentElement?.parentElement?.matches("[data-testid='progressive-diffs-list']")
    ) {
      return file.parentElement;
    }
    return file;
  }

  function normalizeCodeText(text) {
    return text
      .replace(/\u00a0/g, " ")
      .replace(/^[\t ]*[+-]?[\t ]?/, "")
      .trim();
  }

  function isCommentOnlyCell(cell) {
    const commentTokens = [...cell.querySelectorAll(".pl-c")].filter(
      (token) => !token.parentElement?.closest(".pl-c"),
    );
    if (!commentTokens.length) return false;

    const fullText = normalizeCodeText(cell.textContent);
    const commentText = normalizeCodeText(
      commentTokens.map((token) => token.textContent).join(""),
    );
    return (
      Boolean(fullText) &&
      fullText === commentText &&
      !SOURCE_DIRECTIVE_PATTERN.test(commentText)
    );
  }

  function getCodeCommentRows(root = document) {
    const rows = new Set(
      [...root.querySelectorAll(".pl-c")]
        .map((token) => token.closest("tr"))
        .filter((row) => row?.closest(FILE_SELECTOR)),
    );

    return [...rows].filter((row) => {
      const codeCells = [...row.querySelectorAll("code.diff-text, .blob-code-inner")].filter(
        (cell) => normalizeCodeText(cell.textContent),
      );
      return codeCells.length > 0 && codeCells.every(isCommentOnlyCell);
    });
  }

  function parseLineStats(text) {
    const match = text.match(
      /Lines changed:\s*([\d,]+) additions?\s*&\s*([\d,]+) deletions?/i,
    );
    if (!match) return null;
    return {
      additions: Number(match[1].replaceAll(",", "")),
      deletions: Number(match[2].replaceAll(",", "")),
    };
  }

  function getChangedLineCells(file) {
    return [
      ...file.querySelectorAll(
        "code.diff-text.addition, code.diff-text.deletion, " +
          "td.blob-code-addition .blob-code-inner, " +
          "td.blob-code-deletion .blob-code-inner",
      ),
    ];
  }

  function getChangedRows(file) {
    return [
      ...new Set(
        getChangedLineCells(file)
          .map((cell) => cell.closest("tr"))
          .filter(Boolean),
      ),
    ];
  }

  function getLineChangeType(cell) {
    if (
      cell.matches("code.diff-text.deletion") ||
      cell.closest("td.blob-code-deletion")
    ) {
      return "deletions";
    }
    if (
      cell.matches("code.diff-text.addition") ||
      cell.closest("td.blob-code-addition")
    ) {
      return "additions";
    }
    return null;
  }

  function getFileLineStats(file) {
    const summary = [...file.querySelectorAll(".sr-only")].find((element) =>
      element.textContent.trim().startsWith("Lines changed:"),
    );
    const parsed = summary ? parseLineStats(summary.textContent.trim()) : null;
    if (parsed) return parsed;

    const fallback = { additions: 0, deletions: 0 };
    for (const cell of getChangedLineCells(file)) {
      const type = getLineChangeType(cell);
      if (type) fallback[type] += 1;
    }
    return fallback;
  }

  function getNativeLineSummaries() {
    return [...document.querySelectorAll("main .sr-only")].filter(
      (element) =>
        element.textContent.trim().startsWith("Lines changed:") &&
        !element.closest(FILE_SELECTOR),
    );
  }

  function collectLineBreakdown() {
    const breakdown = {
      artifacts: { additions: 0, deletions: 0 },
      code: { additions: 0, deletions: 0 },
      comments: { additions: 0, deletions: 0 },
      config: { additions: 0, deletions: 0 },
      migrations: { additions: 0, deletions: 0 },
      mocks: { additions: 0, deletions: 0 },
      other: { additions: 0, deletions: 0 },
      tests: { additions: 0, deletions: 0 },
    };

    for (const file of getFileDiffs()) {
      const fileStats = getFileLineStats(file);
      const fileCategory = getFileCategory(file);
      if (fileCategory !== "source") {
        breakdown[fileCategory].additions += fileStats.additions;
        breakdown[fileCategory].deletions += fileStats.deletions;
        continue;
      }

      breakdown.code.additions += fileStats.additions;
      breakdown.code.deletions += fileStats.deletions;
      for (const cell of getChangedLineCells(file)) {
        if (!isCommentOnlyCell(cell)) continue;
        const type = getLineChangeType(cell);
        if (type) breakdown.comments[type] += 1;
      }
    }

    breakdown.code.additions = Math.max(
      0,
      breakdown.code.additions - breakdown.comments.additions,
    );
    breakdown.code.deletions = Math.max(
      0,
      breakdown.code.deletions - breakdown.comments.deletions,
    );

    const nativeTotal = getNativeLineSummaries()
      .map((element) => parseLineStats(element.textContent.trim()))
      .find(Boolean);
    if (nativeTotal) {
      const knownAdditions =
        breakdown.code.additions +
        breakdown.comments.additions +
        breakdown.config.additions +
        breakdown.migrations.additions +
        breakdown.artifacts.additions +
        breakdown.mocks.additions +
        breakdown.tests.additions;
      const knownDeletions =
        breakdown.code.deletions +
        breakdown.comments.deletions +
        breakdown.config.deletions +
        breakdown.migrations.deletions +
        breakdown.artifacts.deletions +
        breakdown.mocks.deletions +
        breakdown.tests.deletions;
      breakdown.other.additions = Math.max(
        0,
        nativeTotal.additions - knownAdditions,
      );
      breakdown.other.deletions = Math.max(
        0,
        nativeTotal.deletions - knownDeletions,
      );
    }
    return breakdown;
  }

  function toggleCategoryFocus(category) {
    const selected = new Set(state.settings.focusCategories);
    if (selected.has(category)) {
      selected.delete(category);
    } else {
      selected.add(category);
    }
    state.settings.focusCategories = FOCUS_CATEGORY_ORDER.filter((item) =>
      selected.has(item),
    );
    saveSettings();
  }

  function createLineStat(category, label) {
    const interactive = FOCUS_CATEGORIES.has(category);
    const stat = document.createElement(interactive ? "button" : "span");
    stat.className = "ghprf-line-stat";
    stat.dataset.ghprfCategory = category;
    if (interactive) {
      stat.type = "button";
      stat.classList.add("ghprf-line-stat--action");
      stat.addEventListener("click", () => toggleCategoryFocus(category));
    }

    const labelElement = document.createElement("span");
    labelElement.className = "ghprf-line-stat-label";
    labelElement.textContent = label;

    const additions = document.createElement("span");
    additions.className = "ghprf-line-additions";

    const deletions = document.createElement("span");
    deletions.className = "ghprf-line-deletions";
    stat.append(labelElement, additions, deletions);
    return stat;
  }

  function createLineBreakdown() {
    const element = document.createElement("div");
    element.className = "ghprf-line-breakdown";
    element.dataset.ghprfLineBreakdown = "";
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Line changes split by category");
    element.append(
      createLineStat("code", "Code"),
      createLineStat("comments", "Comments"),
      createLineStat("tests", "Tests"),
      createLineStat("mocks", "Mocks"),
      createLineStat("config", "Config"),
      createLineStat("migrations", "Migrations"),
      createLineStat("artifacts", "Artifacts"),
      createLineStat("other", "Other"),
    );
    return element;
  }

  function updateLineStat(element, stats, excluded, focused = false) {
    element.querySelector(".ghprf-line-additions").textContent =
      `+${stats.additions.toLocaleString()}`;
    element.querySelector(".ghprf-line-deletions").textContent =
      `−${stats.deletions.toLocaleString()}`;
    element.classList.toggle("ghprf-line-stat--excluded", excluded);
    element.hidden = stats.additions === 0 && stats.deletions === 0;
    if (element.matches("button")) {
      element.setAttribute("aria-pressed", String(focused));
      element.title = focused
        ? `Remove ${element.dataset.ghprfCategory} from focus`
        : `Add ${element.dataset.ghprfCategory} to focus`;
      return;
    }
    element.title = excluded
      ? "Excluded by the current PR Focus filters"
      : "Included in the visible diff";
  }

  function renderLineBreakdown(view) {
    const nativeSummaries = getNativeLineSummaries();
    if (!nativeSummaries.length) return;

    const breakdown = collectLineBreakdown();
    for (const summary of nativeSummaries) {
      const nativeContainer = summary.parentElement;
      if (!nativeContainer) continue;
      nativeContainer.classList.add("ghprf-native-line-summary");

      let element = nativeContainer.nextElementSibling;
      if (!element?.matches("[data-ghprf-line-breakdown]")) {
        element = createLineBreakdown();
        nativeContainer.insertAdjacentElement("afterend", element);
      }

      updateLineStat(
        element.querySelector("[data-ghprf-category='code']"),
        breakdown.code,
        !isLineCategoryVisible("code", view),
        view.focusCategories.has("code"),
      );
      updateLineStat(
        element.querySelector("[data-ghprf-category='comments']"),
        breakdown.comments,
        !isLineCategoryVisible("comments", view),
        view.focusCategories.has("comments"),
      );
      updateLineStat(
        element.querySelector("[data-ghprf-category='tests']"),
        breakdown.tests,
        !isLineCategoryVisible("tests", view),
        view.focusCategories.has("tests"),
      );
      updateLineStat(
        element.querySelector("[data-ghprf-category='mocks']"),
        breakdown.mocks,
        !isLineCategoryVisible("mocks", view),
        view.focusCategories.has("mocks"),
      );
      updateLineStat(
        element.querySelector("[data-ghprf-category='config']"),
        breakdown.config,
        !isLineCategoryVisible("config", view),
        view.focusCategories.has("config"),
      );
      updateLineStat(
        element.querySelector("[data-ghprf-category='migrations']"),
        breakdown.migrations,
        !isLineCategoryVisible("migrations", view),
        view.focusCategories.has("migrations"),
      );
      updateLineStat(
        element.querySelector("[data-ghprf-category='artifacts']"),
        breakdown.artifacts,
        !isLineCategoryVisible("artifacts", view),
        view.focusCategories.has("artifacts"),
      );
      updateLineStat(
        element.querySelector("[data-ghprf-category='other']"),
        breakdown.other,
        view.hasFocus,
      );
    }
  }

  function getTreeFileItems(tree) {
    return [...tree.querySelectorAll("[role='treeitem'][id]")].filter((item) => {
      const ownContent = item.querySelector(":scope > div");
      return Boolean(ownContent?.querySelector("a[href^='#diff-']"));
    });
  }

  function applyFileTreeFilter(view) {
    const tree = document.querySelector("[role='tree'][aria-label='File Tree']");
    if (!tree) return 0;

    const fileItems = getTreeFileItems(tree);
    for (const item of fileItems) {
      const category = filters.getFileCategory(item.id);
      setClass(
        item,
        "ghprf-hidden-tree-item",
        !isFileCategoryVisible(category, view),
      );
    }

    const folderItems = [...tree.querySelectorAll("[role='treeitem']")].filter((item) =>
      item.querySelector(":scope > [role='group']"),
    );
    for (const folder of folderItems) {
      const descendantFiles = getTreeFileItems(folder);
      const allFilesHidden =
        descendantFiles.length > 0 &&
        descendantFiles.every((item) =>
          item.classList.contains("ghprf-hidden-tree-item"),
        );
      setClass(
        folder,
        "ghprf-hidden-tree-item",
        allFilesHidden,
      );
    }
  }

  function applyFilters(view) {
    for (const row of document.querySelectorAll(
      ".ghprf-hidden-code-comment, .ghprf-hidden-code-line",
    )) {
      row.classList.remove(
        "ghprf-hidden-code-comment",
        "ghprf-hidden-code-line",
      );
    }

    for (const file of getFileDiffs()) {
      const fileCategory = getFileCategory(file);
      const hideTarget = getFileHideTarget(file);
      setClass(
        hideTarget,
        "ghprf-hidden-category",
        !isFileCategoryVisible(fileCategory, view),
      );

      const commentRows = new Set(
        fileCategory === "source" ? getCodeCommentRows(file) : [],
      );
      for (const row of commentRows) {
        setClass(
          row,
          "ghprf-hidden-code-comment",
          view.hideCodeComments,
        );
      }
      for (const row of getChangedRows(file)) {
        setClass(
          row,
          "ghprf-hidden-code-line",
          fileCategory === "source" && view.hideCode && !commentRows.has(row),
        );
      }
    }

    applyFileTreeFilter(view);
  }

  function removeFilters() {
    for (const element of document.querySelectorAll(
      ".ghprf-hidden-category, .ghprf-hidden-test, .ghprf-hidden-non-test, " +
        ".ghprf-hidden-tree-item, .ghprf-hidden-code-line, " +
        ".ghprf-hidden-code-comment, .ghprf-hidden-comment",
    )) {
      element.classList.remove(
        "ghprf-hidden-test",
        "ghprf-hidden-non-test",
        "ghprf-hidden-category",
        "ghprf-hidden-tree-item",
        "ghprf-hidden-code-line",
        "ghprf-hidden-code-comment",
        "ghprf-hidden-comment",
      );
    }
    for (const element of document.querySelectorAll(".ghprf-native-line-summary")) {
      element.classList.remove("ghprf-native-line-summary");
    }
    for (const element of document.querySelectorAll("[data-ghprf-line-breakdown]")) {
      element.remove();
    }
    for (const element of document.querySelectorAll("[data-ghprf-controls]")) {
      element.remove();
    }
  }

  function refresh() {
    state.scheduled = false;
    try {
      if (!hasValidExtensionContext()) {
        deactivate();
        return;
      }

      if (!isFilesPage()) {
        removeFilters();
        return;
      }
      if (ensureWhitespaceHidden()) return;

      const view = getViewSettings();
      applyFilters(view);
      renderLineBreakdown(view);
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) throw error;
      deactivate();
    }
  }

  function scheduleRefresh() {
    if (!hasValidExtensionContext()) {
      deactivate();
      return;
    }
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(refresh);
  }

  function loadSettings() {
    if (!hasValidExtensionContext()) return;
    try {
      chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (stored) => {
        const savedSettings = stored[STORAGE_KEY] || {};
        let savedCategories = [];
        if (Array.isArray(savedSettings.focusCategories)) {
          savedCategories = savedSettings.focusCategories;
        } else if (FOCUS_CATEGORIES.has(savedSettings.focusCategory)) {
          savedCategories = [savedSettings.focusCategory];
        }
        state.settings = {
          focusCategories: FOCUS_CATEGORY_ORDER.filter((category) =>
            savedCategories.includes(category),
          ),
        };
        refresh();
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      });
    } catch (_error) {
      deactivate();
    }
  }

  document.addEventListener("turbo:load", scheduleRefresh);
  document.addEventListener("pjax:end", scheduleRefresh);
  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("pagehide", () => observer.disconnect());
  loadSettings();
})();
