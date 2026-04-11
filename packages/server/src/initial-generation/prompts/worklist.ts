export function buildWorklistStructureLines(): string[] {
  return [
    'This is a worklist bootstrap driven by explicit user-supplied work items.',
    'Treat the explicit work list as the source of truth for scope.',
    'Preserve user-supplied work items instead of replacing them with generic template content.',
    'Only infer supporting tasks when they are clearly necessary and keep them aligned with the stated worklist policy.',
  ];
}

export function buildWorklistSchedulingLines(): string[] {
  return [
    'Sequence the explicit worklist credibly with no cycles.',
    'Keep any inferred supporting dependencies aligned with the user-supplied scope.',
  ];
}
