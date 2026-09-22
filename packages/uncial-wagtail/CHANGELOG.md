# uncial-wagtail

## 2.0.3

### Patch Changes

- 22ef156: Add PyPI metadata, MIT license file, and trusted-publisher release workflow
  - uncial@2.0.3

## 2.0.2

### Patch Changes

- Updated dependencies [1d27c39]
  - uncial@2.0.2

## 2.0.1

### Patch Changes

- Updated dependencies [c789496]
  - uncial@2.0.1

## 2.0.0

### Patch Changes

- 8eccada: Rebuild the shipped editor bundle so its token defaults sit in the
  `uncial-tokens` cascade layer. The committed bundle predated that change, so the
  Wagtail integration served unlayered defaults that took a host's own `--uncial-*`
  values back when the editor mounted.
- Updated dependencies [fba726b]
- Updated dependencies [fba726b]
- Updated dependencies [3ac9918]
- Updated dependencies [8d7dbf1]
  - uncial@2.0.0

## 1.0.0

### Minor Changes

- c9f709a: Polish the editor and core runtime: live attribute edits now validate per-field, metadata support is available on `<uncial-editor>`, and browser-only editor code stays out of SSR imports.

  Also tightens attribute defaults/schema guards, improves editor accessibility and Wagtail admin layout, and replaces global chooser events with scoped callbacks.

### Patch Changes

- Updated dependencies [c9f709a]
  - uncial@1.0.0

## 0.0.7

### Patch Changes

- 926bc45: Add editable metadata to pm document; improve wagtail integration and demo
- Updated dependencies [8849aa9]
- Updated dependencies [926bc45]
  - uncial@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [89eb04f]
  - uncial@0.0.6

## 0.0.5

### Patch Changes

- Updated dependencies [05dc82a]
  - uncial@0.0.5
