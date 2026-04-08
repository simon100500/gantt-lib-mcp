# Session Handoff

Continue Remediation 3 for initial generation.

Current findings:

- progressive commit path exists
- but UI still receives `tasks` only at the end of the run
- starter result is too large and expensive
- task names are too long
- runtime still contains legacy initial-generation code that should be cleaned up

Priority order:

1. broadcast tasks after skeleton commit
2. broadcast tasks after each phase commit
3. cap first-pass scope to a compact starter schedule
4. enforce short task titles
5. remove runtime legacy initial-generation path

Benchmark prompt:

- `График строительства жилого дома на 3 этажа + гараж`

Success criteria:

- first phases appear quickly in the graph
- later phases appear incrementally
- no model-generated dates
- compact starter graph
- concise titles
- usable partial result survives late-phase failure
