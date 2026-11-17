# Uncial Improvement Plan

A remediation plan from a full design and code-quality review (2026-07-02) of `uncial`
(~8.7k LOC TypeScript/Svelte).

**Verdict from the review:** strong architecture (genuinely framework-agnostic core, zero `any`,
layered href sanitization) undermined by a cluster of correctness bugs in the editor and a
safety net (tests + CI) too thin to catch them.

Work is ordered by priority. Each phase is independently shippable; within a phase, items are
roughly independent unless noted.

---

## Phase 1 — CI and test infrastructure (the safety net for everything below)

### 1.1 Make release CI run the test suites
`.github/workflows/release.yml`

- The `validate` job only runs `bun run check` (type-check). No unit, browser, or e2e tests
  gate publishing.
- Fix: extend `validate` to run `bun run test:unit`, `bun run test:browser` (with
  `npx playwright install --with-deps chromium`), and Playwright e2e. Fail the job on any failure.

### 1.2 Fix the broken browser test project
`packages/uncial/vite.config.ts` (vitest `client` project)

- `bun run test:browser -- --run` currently exits 1 with an unhandled
  `@vitest/browser-playwright` error; 4 test files are collected but zero tests run.
- Diagnose (likely provider/browser install or vitest 4 project config), fix, and confirm the
  existing `.svelte.spec.ts` files actually execute. This must land before 1.1 can gate on it.

---

## Phase 2 — Correctness bugs (uncial core + editor)

### 2.1 `normalizeDocument` crashes on malformed input
`packages/uncial/src/lib/core/normalize.ts:9-43`

- `normalizeNode` dereferences `node.type`/`node.content` without shape checks:
  `{type:'doc', content:[null]}` throws `TypeError`; a truthy non-array `marks` crashes
  `marks.filter`. `validateDocument` handles the same inputs gracefully — normalize, whose whole
  job is taming untrusted docs (its signature accepts `Partial<PMDoc> | null | undefined`), must too.
- Fix: guard each node (drop or replace non-object nodes), coerce non-array `marks`/`content`.
- Tests: null nodes, non-array marks/content, non-object attrs through `normalizeDocument`;
  cover `MALFORMED_NODE`/`UNKNOWN_BLOCK` paths in `validate.ts` while here.

### 2.2 Container content expression contradicts core semantics
`packages/uncial/src/lib/shared/tiptap.ts:336-344`

- The editor schema gives containers `(${customBlockNames})*` — only custom blocks allowed —
  while core `kind: 'flow'` semantics and `normalize.spec.ts:151-183` explicitly preserve
  paragraph children. Tiptap silently drops content core considers valid.
- Fix: make the container content expression include flow content (`(paragraph | ... | blocks)*`
  or `block+` as appropriate), driven by the block's declared `content` kind. Add a unit test
  asserting a container with a paragraph child round-trips through the editor schema.

### 2.3 Stop destroy/remount of block components on attribute change
`packages/uncial/src/lib/shared/tiptap.ts:121-141`, `packages/uncial/src/lib/runtime/svelte.ts`,
`packages/uncial/src/lib/core/runtime.ts:10`

- `NodeView.update` destroys and remounts the Svelte component whenever attrs change, so a block
  component containing an input wired to `updateAttributes` loses DOM state/focus per keystroke.
  The `BlockEditorMountHandle.update?()` contract exists for exactly this but is never called.
- Fix: back mount props with `$state` in the Svelte runtime so `update()` mutates props in place;
  call `handle.update(...)` from the nodeview and fall back to remount only for runtimes that
  don't implement it.

### 2.4 Web components: property sets tear down the editor
`packages/uncial/src/lib/web-components/index.ts:34-58`

- `setProp` remounts the entire Svelte tree (and Tiptap editor) on every property assignment —
  `el.json = doc` loses focus, selection, and undo history. Same root cause as 2.3: mount with
  `$state`-backed props and mutate.
- While here: the open shadow root has no stylesheet story — components render unstyled with no
  documented hook. Either adopt the package CSS via `adoptedStyleSheets`, accept a stylesheet
  property, or render into light DOM; document the choice. Add an editor-element test
  (only the renderer element is tested today).

### 2.5 Link editing: dropped attributes and dangling `#` links
`packages/uncial/src/lib/editor/attributesController.ts:456-463`,
`packages/uncial/src/lib/shared/tiptap.ts:233-241`,
`packages/uncial/src/lib/editor/Toolbar.svelte:91-98`

- `commitLinkAttributes` sets `title`/`class`, but `LinkMark` only declares `href`/`target`/`rel`
  — ProseMirror silently drops them; the panel fields are no-ops. Declare the attributes (or
  remove the fields). Separately, the toolbar applies `toggleLink({href:'#'})` *before* opening
  the panel, so canceling leaves a literal `#` link — apply the link only on panel commit, or
  unset it on cancel.

### 2.6 Renderer crashes on repeated text runs
`packages/uncial/src/lib/render/RichContent.svelte:20-24`

- `getNodeKey` keys text nodes as `${type}:${text}` without the index; two identical text nodes
  under one parent (trivially produced by mark splitting) throw Svelte's `each_key_duplicate`.
- Fix: include the child index in the key. Test: render `"hi **x** hi "`.

### 2.7 Stale active-state in the rich-text attribute editor
`packages/uncial/src/lib/editor/RichTextAttributeEditor.svelte`

- No transaction/selectionUpdate subscription, so `isActive('bold')` never re-evaluates after
  mount. Fix by reusing the `createSubscriber` pattern from `Toolbar.svelte:59-89` — ideally by
  refactoring the nine copy-pasted button blocks into the `toolbarFeatures.ts` descriptor loop,
  which fixes the staleness in one place and deletes ~120 lines (see 5.1).

### 2.8 Make document versioning real (or remove it)
`packages/uncial/src/lib/core/normalize.ts:7,59`, `packages/uncial/src/lib/shared/content.ts:10`,
`packages/uncial/src/lib/editor/bindEditor.ts:35-39`

- `CURRENT_DOCUMENT_VERSION` is stamped but never read: no migration hook, and a future-version
  doc is silently rewritten as v1. Decide the story now, before stored docs exist in the wild:
  read `document.version` in `normalizeDocument`, run registered migrations for older versions,
  and emit a validation issue (don't silently downgrade) for newer ones. Replace the hardcoded
  `version: 1` in `content.ts` with the constant.

---

## Phase 4 — Packaging and adoption blockers

### 4.3 Keep browser-only code out of SSR import graphs
`packages/uncial/src/lib/index.ts`, `packages/uncial/src/lib/render/Renderer.svelte:15`

- The root barrel re-exports `./editor`; `Renderer.svelte` imports `runtime/svelte.js` just for
  `SVELTE_RUNTIME_ID`, dragging `BlockNodeView`/mount machinery into SSR bundles. Move the ID
  constant to a dependency-free leaf module; document that SSR consumers should import
  `uncial/render` + `uncial/core` (or drop `./editor` from the root barrel as a breaking change
  at next minor).

---

## Phase 5 — Design debt and code health

### 5.1 Decompose `attributesController.ts` (767 lines, zero tests)
`packages/uncial/src/lib/editor/attributesController.ts`

The largest, most branch-dense file in the repo. In order:
1. **Write characterization tests first** — especially for `syncFromSelection` (lines 249-335),
   an implicit state machine of five interdependent booleans.
2. **Remove wall-clock coordination**: `explicitContainerOpenUntil = Date.now() + 300/1000`
   (lines 175, 389, 628, 664, 694, 735) is a race by construction. Replace with explicit state
   transitions (e.g. a flag cleared by the next selection event it was meant to suppress).
3. **Extract sub-controllers**: link editing (~100 lines) and container-child ops (~180 lines)
   are cleanly separable; add a `resolveActiveBlock()` helper for the five duplicated
   `findBlockAt` preambles; fold the `CODE_BLOCK_ID` special case (5 call sites) into a virtual
   registry entry.
4. Export a single `createInitialState()` and delete the three duplicated state literals
   (`Editor.svelte:61-74`, `bindEditor.ts:45-60`, `BlockAttributesPanel.svelte:23-36`).

### 5.2 Core cleanups (small, mechanical)
- Dedupe: `normalizeBlockAttributes` vs `parseBlockDraftAttributes` (byte-identical,
  `attributes.ts:119-129/177-187`); `pushIssue` (validate.ts/meta.ts); `isPlainObject` ×3;
  `isAttributeOption` ×2; export `DEFAULT_MARKS` and reuse in `tiptap.ts:281`.
- Use the registry's existing `byId` map instead of rebuilding it in `normalize.ts:51-53` and
  `validate.ts:244-246`.
- Fix `defineBlock.ts:61-66` unreachable "must define a default" check (an object config without
  `default` is silently misparsed as a shorthand object default) — tighten
  `AttributeConfig<T>` so the invalid state is representable as an error.
- `coerceAttributeValue` (`attributes.ts:61-63`): treating `''` as missing means string attrs
  can never be cleared to empty; only apply the default for `undefined`/`null`. Also clone
  object/array defaults instead of returning them by reference, and run `spec.validate` during
  coercion so normalize can't emit values validate rejects.
- Type fixes: `BlockIcon = string | unknown` → a real union; unsound
  `hasRichTextContent` guard (`richText.ts:90-92`); `getPos as () => number` hiding `undefined`
  (`tiptap.ts:209`); make `contentDOM` a first-class typed field on `BlockEditorMountOptions`
  instead of a magic props key (`runtime/svelte.ts:59`, `tiptap.ts:64`).
- `resolveRichTextFeatures` silently strips an explicitly requested `'link'`
  (`richText.ts:97,103`) — either support it or surface an issue.
- `createSchema` silently drops unknown ids in `allowedBlocks` (`registry.ts:53`) — warn.

### 5.3 Editor/UI polish
- Refactor `RichTextAttributeEditor.svelte` onto the `toolbarFeatures.ts` descriptor loop
  (fixes 2.7, deletes ~120 lines).
- `bindEditor.ts:157-163,218-220`: normalize+validate+stringify runs twice per keystroke —
  memoize on the serialized doc; document (or deep-compare) the reference-equality recreation
  keys at `bindEditor.ts:206-210`.
- A11y: associate labels with inputs in `AttributeFieldControl.svelte:34-35` (`<label for>`);
  Escape/outside-click handling for the `<details>` dropdowns; keep the Move up/down buttons as
  the keyboard path for drag handles.
- Web components: add `meta`/`metaFields` + a `uncial-meta-change` event to `UncialEditor`;
  decide and document the attribute-reflection story (currently only JS properties work).
- `sanitize.ts:7`: reject protocol-relative `//host` URLs in the app-relative fast path.

### 5.4 Test coverage targets (beyond bug-specific tests above)
- `shared/tiptap.ts` (349 lines, untested): attrs `parseHTML`/`renderHTML` round-trip,
  `LinkMark` sanitization, container content expression, nodeview lifecycle.
- Versioning behavior: missing / older / future `version` docs.
- Serializers without direct tests: `serializeBlockAttributes`, `serializeMeta`,
  `parseMetaDraftValues`, `syntaxHighlight.ts` (incl. `escapeHtml`).

---

## Verification

- **Phase 1:** a PR with a deliberately failing test blocks the release workflow; browser suite
  reports real executed test counts.
- **Phase 2:** `bun run test` green across server/client/e2e; manual editor session — type into
  a custom block input (focus retained), cancel a link edit (no `#` link), render doc with
  repeated text runs.
- **Phases 4-5:** `bun run check` and full suites stay green after each refactor step.

## Suggested sequencing

Phase 1 first (1.2 before 1.1). Phase 2 items are independent bug fixes,
good for individual PRs. Phase 5.1 (controller tests + refactor) should precede other edits to
`attributesController.ts`. Everything in Phase 5.2-5.3 is safe to batch opportunistically.
