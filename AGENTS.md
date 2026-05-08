# Project Instructions

- Do not connect local packages via `file:`, `link:`, relative paths, symlinks, or direct workspace paths outside this repository.
- Do not switch dependencies to unpublished local builds in order to test changes.
- For `gantt-lib` and any other external dependency, keep npm/package-registry dependencies only. If a newer package version is needed, the user updates npm separately.
