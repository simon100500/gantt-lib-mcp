export function buildWorklistStructureLines(): string[] {
  return [
    'This is a worklist bootstrap driven by explicit user-supplied work items.',
    'Treat the explicit work list as the source of truth for scope.',
    'Preserve user-supplied work items instead of replacing them with generic template content.',
    'If the user already provided a plain task list, keep one task per user-supplied work item.',
    'Do not split one user-supplied work item into multiple tasks unless the user explicitly requested decomposition.',
    'Do not invent discipline-based phases or subphases when the user only provided a flat list of work items.',
    'If the user did not provide hierarchy, keep grouping minimal and pragmatic.',
    'If a would-be group contains only 1-2 tasks, do not force a separate subgroup for it unless the user explicitly asked for hierarchy.',
    'Only infer supporting tasks when they are clearly necessary and keep them aligned with the stated worklist policy.',
  ];
}

export function buildWorklistSchedulingLines(): string[] {
  return [
    'Sequence the explicit worklist credibly with no cycles.',
    'Treat each preserved work item as atomic during scheduling.',
    'Do not split one work item into multiple scheduled tasks.',
    'Do not default to a simple sequential chain when the user supplied concrete calendar facts.',
    'If the user supplied fixed dates, date ranges, stay lengths, or itinerary order, preserve that calendar logic as the primary source of sequencing.',
    'When the request contains an explicit overall trip or project window, place tasks inside that window instead of anchoring them to an arbitrary current date.',
    'Keep any inferred supporting dependencies aligned with the user-supplied scope.',
  ];
}
