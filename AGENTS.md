# Project Instructions

- Do not connect local packages via `file:`, `link:`, relative paths, symlinks, or direct workspace paths outside this repository.
- Do not switch dependencies to unpublished local builds in order to test changes.
- For `gantt-lib` and any other external dependency, keep npm/package-registry dependencies only. If a newer package version is needed, the user updates npm separately.
- If a bug or behavior is more correctly fixed inside `gantt-lib` itself than worked around in this repository, say that explicitly and ask the user for the source path/link to the `gantt-lib` implementation so the fix can be made there first. The user is the `gantt-lib` developer.
