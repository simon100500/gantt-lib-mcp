export function buildPartialScopeStructureLines(): string[] {
  return [
    'This is a partial-scope bootstrap, not a whole-project baseline.',
    'Constrain phases and subphases to the requested fragment only.',
    'Do not pad the graph with unrelated whole-project workstreams.',
    'Include fragment-appropriate completion milestones for the requested fragment.',
  ];
}

export function buildPartialScopeSchedulingLines(): string[] {
  return [
    'Build a realistic dependency graph for the requested fragment only with no cycles.',
    'Do not introduce dependencies that imply unrelated whole-project work outside the requested fragment.',
  ];
}
