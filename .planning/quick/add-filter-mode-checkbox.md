# Quick Task: Add Filter Mode Checkbox

## Context
Library now supports `filterMode` prop to switch between 'highlight' (default) and 'hide' modes. Need to add a checkbox "Только найденные" to FilterPopup.

## Changes Required

### 1. Add filterMode to useUIStore
**File:** `packages/web/src/stores/useUIStore.ts`

- Add type to interface (after line 37):
```typescript
filterMode: 'highlight' | 'hide';
```

- Add to initial state (after line 93):
```typescript
filterMode: 'highlight',
```

- Add setter type (after line 63):
```typescript
setFilterMode: (value: 'highlight' | 'hide') => void;
```

- Add setter implementation (after line 119):
```typescript
setFilterMode: (filterMode) => set({ filterMode }),
```

- Update resetFilters to include filterMode (line ~120-126):
```typescript
resetFilters: () => set({
  filterWithoutDeps: false,
  filterExpired: false,
  filterSearchText: '',
  filterDateFrom: '',
  filterDateTo: '',
  filterMode: 'highlight',
}),
```

### 2. Add Checkbox to FilterPopup
**File:** `packages/web/src/components/FilterPopup.tsx`

- Add state imports (after line 28):
```typescript
const filterMode = useUIStore((state) => state.filterMode);
const setFilterMode = useUIStore((state) => state.setFilterMode);
```

- Add checkbox after "Просроченные" (after line 83, before `<DropdownMenuSeparator />`):
```tsx
{/* Filter mode checkbox */}
<DropdownMenuItem
  onSelect={(event) => {
    event.preventDefault();
    setFilterMode(filterMode === 'hide' ? 'highlight' : 'hide');
  }}
  className="flex cursor-pointer items-center gap-2"
>
  <input
    type="checkbox"
    checked={filterMode === 'hide'}
    readOnly
    className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary pointer-events-none"
  />
  <span className="text-sm">Только найденные</span>
</DropdownMenuItem>
```

- Update hasActiveFilters to include filterMode (line ~31):
```typescript
const hasActiveFilters =
  filterWithoutDeps ||
  filterExpired ||
  filterSearchText.trim().length > 0 ||
  (filterDateFrom && filterDateTo) ||
  filterMode === 'hide';
```

### 3. Pass Props to GanttChart Component
**File:** `packages/web/src/components/GanttChart.tsx`

- Add new props to interface (after line 34):
```typescript
filterMode?: 'highlight' | 'hide';
```

- Add to destructuring (line ~74):
```typescript
filterMode,
```

- Pass to library (after line 129):
```typescript
filterMode={filterMode}
```

### 4. Connect in ProjectWorkspace
**File:** `packages/web/src/components/workspace/ProjectWorkspace.tsx`

- Add filterMode to UIStore reads (after line ~73):
```typescript
const filterMode = useUIStore((state) => state.filterMode);
```

- Pass to GanttChart (after line ~200):
```typescript
filterMode={filterMode}
```

### 5. Update GanttChartProps Interface
**File:** `packages/web/src/components/GanttChart.tsx`

Add prop type (after line 34):
```typescript
filterMode?: import('gantt-lib').FilterMode;
```

## Verification
- [ ] Checkbox "Только найденные" appears in FilterPopup
- [ ] Toggling checkbox switches between highlight/hide modes
- [ ] Reset button resets filterMode to 'highlight'
- [ ] Props passed through to GanttLib correctly
