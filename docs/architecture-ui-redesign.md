## Architecture: CF-Desktop UI Redesign

### Overview

Declutter the cf-desktop UI by extracting two new reusable components (ValidatedInput, ObstacleTree), simplifying the GridConfigPanel to a 2x2 grid layout, removing visual noise from the top bar and sidebar, and switching the main content panel from scrollable to overflow-hidden for auto-fit behavior.

### Component Breakdown

| Component | Responsibility | File |
|-----------|---------------|------|
| `ValidatedInput` | Numeric input with blur-validation, red border on invalid, tooltip with range/description | `src/components/ValidatedInput.tsx` (NEW) |
| `ObstacleTree` | Sidebar tree listing obstacles with type icons, select/delete/duplicate/right-click context menu | `src/components/ObstacleTree.tsx` (NEW) |
| `GridConfigPanel` | 2x2 preset grid, Nx/Ny inputs, cell count + aspect ratio only | `src/components/GridConfigPanel.tsx` (MODIFY) |
| `FeatureTree` | Left panel sections with collapsed defaults, no overflow-x | `src/components/FeatureTree.tsx` (MODIFY) |
| `App` | Simplified header (title only), export buttons moved to Results section | `src/App.tsx` (MODIFY) |

### Data Flow

```
User types in ValidatedInput
  -> value stored as-is (no clamping on keystroke)
  -> on blur: validate against [min, max]
  -> if invalid: red border + tooltip shows valid range
  -> if valid: call onChange(value)

User clicks obstacle in ObstacleTree
  -> onSelect(id) called
  -> GeometryEditor highlights shape on canvas
  -> ObstacleTree shows inline properties for selected shape

User right-clicks obstacle in ObstacleTree
  -> context menu appears (Delete, Duplicate, Edit)
  -> calls onDelete/onDuplicate/onEdit accordingly

User selects grid preset in GridConfigPanel (2x2 grid)
  -> computeGridForPreset() computes nx, ny
  -> onGridConfigChange({ nx, ny, quality })
  -> summary shows cell count + aspect ratio (no memory/runtime)
```

### File Structure

| File | Purpose | Changes |
|------|---------|---------|
| `src/components/ValidatedInput.tsx` | NEW: Reusable validated numeric input | ~80 lines |
| `src/components/ObstacleTree.tsx` | NEW: Obstacle list with context menu | ~150 lines |
| `src/components/GridConfigPanel.tsx` | MODIFY: 2x2 grid presets, remove memory/runtime | ~120 lines (from 290) |
| `src/components/FeatureTree.tsx` | MODIFY: collapsed defaults, use ValidatedInput + ObstacleTree, remove export buttons | ~500 lines (from 604) |
| `src/App.tsx` | MODIFY: simplified header, export buttons in Results, overflow-hidden main | ~580 lines (from 614) |
| `src/styles.css` | MODIFY: add ValidatedInput styles, ObstacleTree styles, 2x2 grid preset styles, remove gcp-memory-bar/gcp-stats memory+runtime | ~2100 lines (from 2235) |
| `src/types.ts` | No changes needed |  |

### Technology Decisions

| Decision | Choice | Why | Alternative Rejected | Trade-off |
|----------|--------|-----|---------------------|-----------|
| ValidatedInput validation trigger | `onBlur` only | Avoids red-border flicker while typing; user can type freely | Validate on every keystroke | User won't see range errors until they leave the field |
| ValidatedInput HTML min/max | Removed | HTML min/max silently clamps values, hiding user intent | Keep HTML min/max | Must implement custom validation logic |
| ValidatedInput tooltip | CSS `:hover` + `:focus-within` pseudo-tooltip | Zero JS overhead, no portal needed | React tooltip library | Less flexible positioning |
| ObstacleTree context menu | Native `onContextMenu` + positioned div | No dependency, matches desktop app pattern | Third-party menu library | Must handle click-outside dismiss manually |
| GridConfigPanel layout | CSS Grid 2x2 | Clean visual hierarchy, equal-sized cells | Keep horizontal row | Removes "Custom" as a visible preset button (still accessible via Nx/Ny edit) |
| Memory/Runtime estimates | Removed from GridConfigPanel | Reduces visual clutter; these are estimates anyway | Keep but hide behind toggle | Users lose quick reference for simulation cost |
| Export buttons location | Move to Results section in sidebar | Header becomes clean title bar; exports only relevant when results exist | Keep in header | Extra click to reach export in sidebar vs header |

### Interfaces

#### ValidatedInput

```typescript
interface ValidatedInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  unit?: string;
  description?: string;
  onChange: (value: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
}
```

Internal state:
- `localValue: string` -- raw string from input, allows intermediate invalid states
- `isInvalid: boolean` -- set on blur, cleared on valid change

Rendering:
```
<div class="validated-input-wrapper">
  <label>{label}</label>
  <div class="validated-input-container">
    <input
      class={isInvalid ? 'invalid' : ''}
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      disabled={disabled}
    />
    {unit && <span class="validated-input-unit">{unit}</span>}
  </div>
  {(description || isInvalid) && (
    <div class="validated-input-tooltip">
      {isInvalid ? `Valid range: ${min}--${max}` : description}
    </div>
  )}
</div>
```

#### ObstacleTree

```typescript
interface ObstacleTreeProps {
  shapes: Shape[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onEdit: (id: string) => void;
  disabled?: boolean;
}
```

Internal state:
- `contextMenu: { x: number; y: number; shapeId: string } | null`

Rendering:
```
<div class="obstacle-tree">
  {shapes.map(shape => (
    <div
      class={`obstacle-item ${selectedId === shape.id ? 'selected' : ''}`}
      onClick={() => onSelect(shape.id)}
      onContextMenu={e => showContextMenu(e, shape.id)}
    >
      <span class="obstacle-icon">{shapeIcon(shape.type)}</span>
      <span class="obstacle-label">{shapeLabel(shape)}</span>
      <button class="obstacle-delete" onClick={e => { e.stopPropagation(); onDelete(shape.id); }}>
        x
      </button>
    </div>
  ))}
  {contextMenu && (
    <div class="obstacle-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      <button onClick={() => onDuplicate(contextMenu.shapeId)}>Duplicate</button>
      <button onClick={() => onEdit(contextMenu.shapeId)}>Edit</button>
      <button onClick={() => onDelete(contextMenu.shapeId)}>Delete</button>
    </div>
  )}
</div>
```

#### GridConfigPanel (revised)

```typescript
interface GridConfigPanelProps {
  caseType: string;
  gridConfig: GridConfig;
  onGridConfigChange: (config: GridConfig) => void;
  disabled: boolean;
}
```

Removed props: `maxSteps`, `saveInterval`, `systemInfo` (no longer needed without memory/runtime estimates).

Layout:
```
<div class="grid-config-panel">
  <div class="gcp-presets-grid">  <!-- 2x2 grid -->
    <button class="gcp-preset-btn" data-quality="draft">Draft<span>0.5x</span></button>
    <button class="gcp-preset-btn" data-quality="standard">Standard<span>1.0x</span></button>
    <button class="gcp-preset-btn" data-quality="high">High<span>2.0x</span></button>
    <button class="gcp-preset-btn" data-quality="ultra">Ultra<span>3.0x</span></button>
  </div>

  <div class="gcp-dimensions">
    <!-- Nx / lock / Ny row (unchanged) -->
  </div>

  <div class="gcp-summary">
    <span class="gcp-summary-item">240K cells</span>
    <span class="gcp-summary-item">2.67:1</span>
  </div>
</div>
```

### CSS Changes Summary

**Add:**
- `.validated-input-wrapper` -- flex column, relative positioning for tooltip
- `.validated-input-container` -- flex row (input + unit)
- `.validated-input-unit` -- muted label suffix
- `.validated-input-tooltip` -- absolute positioned, shown on hover/focus-within
- `.validated-input.invalid` -- red border (`border-color: var(--danger)`)
- `.obstacle-tree` -- vertical list matching tree-item styling
- `.obstacle-item` -- flex row, hover highlight, selected state
- `.obstacle-context-menu` -- absolute positioned div with button list
- `.gcp-presets-grid` -- `display: grid; grid-template-columns: 1fr 1fr; gap: 3px;`
- `.gcp-summary` -- flex row with two items (cells + aspect ratio)

**Remove:**
- `.gcp-memory-bar-container`, `.gcp-memory-bar-label`, `.gcp-memory-bar-track`, `.gcp-memory-bar-fill`
- Memory/Runtime stat rows from `.gcp-stats` (keep Cells and Aspect only)

**Modify:**
- `.content` -- change `overflow-y: auto` to `overflow: hidden`
- `.sidebar` -- add `overflow-x: hidden`
- `.app-header .subtitle` -- remove from CSS (or leave as dead code)

### Verification Checklist

- [ ] ValidatedInput accepts any string during typing, validates on blur
- [ ] ValidatedInput shows red border + range tooltip when value is out of [min, max]
- [ ] ValidatedInput does NOT use HTML min/max attributes
- [ ] ObstacleTree renders type icons (circle, rectangle, polygon) matching existing shapeIcon()
- [ ] ObstacleTree right-click shows context menu with Delete/Duplicate/Edit
- [ ] ObstacleTree click selects shape, highlights in canvas via onSelectionChange
- [ ] GridConfigPanel presets arranged in 2x2 grid (Draft/Standard top, High/Ultra bottom)
- [ ] GridConfigPanel shows only cell count (formatted: "240K cells") and aspect ratio ("2.67:1")
- [ ] GridConfigPanel removes memory bar, RAM percentage, runtime estimate
- [ ] App header shows only "AK-Vortex" (no subtitle, no export buttons)
- [ ] Export PNG/VTK buttons accessible in Results section of sidebar
- [ ] Physics section in FeatureTree defaults to collapsed (defaultOpen={false})
- [ ] Solver section in FeatureTree defaults to collapsed (defaultOpen={false})
- [ ] Main content panel has overflow: hidden (no scrollbar)
- [ ] GeometryEditor canvas and FlowCanvas auto-fit to available space
- [ ] No horizontal overflow on sidebar (overflow-x: hidden)
- [ ] All existing functionality preserved (simulation, playback, export, GCI, probe)
