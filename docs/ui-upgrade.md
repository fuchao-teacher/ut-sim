# UI Upgrade Design Specification

## Overview

Phase A/B layout upgrade for the 直探头课堂 UT 仿真 webapp. This document defines design tokens, panel grid constraints, and upgrade boundaries.

## Design Tokens

All visual values are centralized in `src/ui/tokens.css`. Modules consume these tokens via CSS custom properties.

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-deep` | `#0a101c` | Primary background |
| `--color-bg-surface` | `#0d1524` | Secondary surface |
| `--color-panel` | `#121b2e` | Panel backgrounds |
| `--color-panel-elevated` | `#1a2740` | Elevated panels |
| `--color-well` | `#0b1322` | Input wells, depressions |
| `--color-line` | `#24324a` | Borders, dividers |
| `--color-line-subtle` | `#334560` | Subtle separators |
| `--color-text` | `#e2e8f0` | Primary text |
| `--color-text-strong` | `#f8fafc` | Emphasized text |
| `--color-text-muted` | `#94a3b8` | Secondary text |
| `--color-text-dim` | `#64748b` | Tertiary/disabled |
| `--color-accent` | `#38bdf8` | Primary accent (engineering blue) |
| `--color-accent-hi` | `#7dd3fc` | Accent highlight |
| `--color-accent-soft` | `rgba(56,189,248,0.14)` | Accent background tint |
| `--color-warm` | `#fbbf24` | Warning/attention (orange) |
| `--color-ok` | `#34d399` | Success state |
| `--color-bad` | `#f87171` | Error state |

### Type Scale

| Token | Value |
|-------|-------|
| `--text-xs` | `12px` |
| `--text-sm` | `14px` |
| `--text-base` | `16px` |
| `--text-lg` | `18px` |
| `--text-xl` | `22px` |
| `--text-2xl` | `28px` |
| `--text-3xl` | `36px` |

### Spacing Scale

| Token | Value |
|-------|-------|
| `--sp-1` | `4px` |
| `--sp-2` | `8px` |
| `--sp-3` | `12px` |
| `--sp-4` | `16px` |
| `--sp-5` | `20px` |
| `--sp-6` | `24px` |
| `--sp-7` | `32px` |
| `--sp-8` | `40px` |

### Radii

| Token | Value |
|-------|-------|
| `--radius-sm` | `8px` |
| `--radius` | `12px` |
| `--radius-lg` | `16px` |
| `--radius-xl` | `20px` |

### Shadows

| Token | Value |
|-------|-------|
| `--shadow-card` | `0 12px 36px rgba(0,6,14,0.35)` |
| `--shadow-card-hover` | `0 20px 48px rgba(0,8,18,0.5)` |
| `--shadow-dropdown` | `0 8px 24px rgba(0,6,14,0.45)` |

### Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--z-base` | `0` | Default stacking |
| `--z-dropdown` | `10` | Dropdowns, menus |
| `--z-sticky` | `20` | Sticky headers |
| `--z-overlay` | `40` | Overlays, study panels |
| `--z-modal` | `60` | Modals |
| `--z-toast` | `80` | Toasts, notifications |

## Panel Grid Layout

### Desktop (≥900px)

```
┌─────────────────────────────────────────────────────────────┐
│ Top Bar: course title / mode tabs                      60px │
├───────────────────────────────────────┬─────────────────────┤
│ Main Viewport (3D + A-scan)           │ Task/Instrument     │
│ 7fr                                   │ Panel 3fr           │
│                                       │ (min 360px)         │
├───────────────────────────────────────┴─────────────────────┤
│ Control Bar (desktop only)                             68px │
└─────────────────────────────────────────────────────────────┘
```

### Tablet / Compact (≤900px, ≥600px)

- Side panel stacks below viewport or uses tabbed navigation
- Touch targets minimum 44px
- Control bar simplified or hidden

### Mobile / Phone (≤600px)

- Single column, full-width panels
- Bottom tab navigation (scene/wave/ops)
- Floating controls collapsed by default
- Refer to `mobile-compact.css` for breakpoint details

## Hard Constraints (DO NOT CHANGE)

### Scoring System
- All scoring logic in `scoring.js`, `studyscore.js`, `taskscore.js` is frozen
- Rubric calculations, coverage algorithms unchanged
- Assessment state machine unchanged

### Acoustic/Physics Engine
- `physics.js` - wave propagation model frozen
- `waveform.js` - A-scan rendering frozen
- DAC curves, gate calculations unchanged
- Sound velocity, attenuation formulas unchanged

### DeepSeek Integration
- `deepseek.js` - API integration frozen
- Environment variable baking unchanged
- Tutor prompt structure unchanged

### Export Schemas
- UTreport format unchanged
- UTweld export schema unchanged
- Session replay format unchanged
- Case library structure unchanged

### Three.js Scenes
- Scene graph structure unchanged
- Model loading unchanged
- Camera/controls unchanged
- Render loop unchanged

## Animation Guidelines

### CSS Animations
- All CSS animations must respect `prefers-reduced-motion`
- Transitions limited to `opacity`, `transform`, `background-color`, `border-color`
- Maximum duration: 400ms for UI feedback, 600ms for page transitions

### WebGL / rAF
- No CSS animations may depend on or block the WebGL render loop
- Three.js `requestAnimationFrame` is the sole animation driver for 3D
- UI overlays use CSS transitions only, never synchronized to rAF

### Reduced Motion Support
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Migration Notes

### Token Adoption
Existing modules progressively adopt tokens by:
1. Replacing hard-coded hex values with `var(--color-*)` references
2. Replacing px spacing with `var(--sp-*)` scale
3. Replacing font-size literals with `var(--text-*)` scale

### Backward Compatibility
- All existing class names preserved
- JS class hooks unchanged (`.on`, `.active`, `.done`, etc.)
- Panel structure unchanged for JS selectors

## File Structure

```
src/
├── ui/
│   └── tokens.css       # Design tokens (new)
├── theme.css            # Legacy tokens (consumed by tokens.css)
├── style.css            # Main layout + components
├── learning-shell.css   # Learning shell overlay
├── learning-workflow.css
├── v4-workflow.css
├── v5-practice.css
├── study.css
├── mobile-compact.css
└── ...
```

## Phase C: GSAP Motion Layer

Phase C adds GSAP-powered UI animations while preserving all hard constraints.

### Motion Module API

All motion functions are exported from `src/ui/motion.js`:

```javascript
import { 
  pageEnter,      // Page/section fade-up entrance
  pageExit,       // Page/section fade-down exit
  panelToggle,    // Expand/collapse panel animation
  stepAdvance,    // Step completion pulse feedback
  toastIn,        // Toast slide-up entrance
  toastOut,       // Toast fade-out exit
  cardExpand,     // Card grow animation
  modeTransition, // Cross-fade between modes
  highlightPulse, // Attention-drawing pulse
  isReducedMotion,// Check reduced-motion preference
  killAnimations, // Cancel all tweens on target
  gsap,           // Re-exported GSAP instance
} from './ui/motion.js';
```

### Function Signatures

```javascript
// Page/section enter — fade up from below
pageEnter(target, { duration?, y?, stagger?, onComplete? })

// Panel expand/collapse
panelToggle(target, expand: boolean, { duration?, onComplete? })

// Step advance feedback pulse
stepAdvance(target, { duration?, onComplete? })

// Toast enter/exit
toastIn(target, { duration?, y?, onComplete? })
toastOut(target, { duration?, onComplete? })

// Mode transition (cross-fade)
modeTransition(exitTarget, enterTarget, { duration?, onComplete? })
```

### Reduced Motion Handling

All functions check `prefers-reduced-motion` at runtime:
- When reduced motion is preferred, instant state changes are applied (no tween)
- Functions return `null` instead of a tween instance
- The preference is monitored via `matchMedia` listener

```javascript
// Check current preference
if (isReducedMotion()) {
  // Skip animation-dependent logic
}
```

### Integration Points

Phase C wires motion helpers at these call sites:

| Location | Function | Effect |
|----------|----------|--------|
| `showSsToast()` | `toastIn`, `toastOut` | Self-study toast notifications |
| `examKitToast()` | `toastIn`, `toastOut` | Exam kit feedback toasts |
| `buildSteps()` onclick | `stepAdvance` | Practice step button feedback |
| `updateStdBox()` | `panelToggle` | Standard reference panel toggle |

### Constraints

- **No rAF binding**: GSAP timelines never synchronize with Three.js render loop
- **Transform/opacity only**: All tweens use compositor-friendly properties
- **No ScrollTrigger**: Not needed for current UI; add only if theory/manual pages require
- **No Three.js camera**: Camera/controls animation remains in Three.js domain

### Adding New Animations

1. Import the appropriate function from `motion.js`
2. Call at the state-change point (not in render loop)
3. Always test with `prefers-reduced-motion: reduce`

Example:
```javascript
import { pageEnter } from './ui/motion.js';

function showNewPanel(el) {
  el.style.display = '';
  pageEnter(el, { stagger: 0.08 });
}
```

## Phase D: Classroom Flow Guidance UX

Phase D adds unified guidance UI for the classroom practice workflow, making step state (current/completed/blocked) obvious to trainees.

### Classroom Flow Documentation

See [docs/classroom-flow.md](classroom-flow.md) for the complete state diagram documenting:
- Practice workflow steps (calibrate → dac → sensitivity → scan → quantify → evaluate)
- Step state transitions (locked → open → done)
- Entry flows by learning mode
- Blocking reasons and resolutions
- Guide checklist system

### New CSS Module: `src/ui/step-guidance.css`

Unified styling for:

| Component | Purpose |
|-----------|---------|
| `.prac-steps` | Step bar with `.on`, `.done`, `.locked` states |
| `.step-progress` | Visual progress bar showing completed/total steps |
| `.step-blocked` | Blocking reason banner with action button |
| `.guide` / `.gd-*` | Guide checklist panel styling |
| `.pc-*` | Practice card table/kv improvements |
| `.exam-*` | Score/report drawer enhancements |

### Step Bar Visual States

```css
/* Current step */
.prac-steps button.on { border-color: var(--color-accent-deep); }

/* Completed step */
.prac-steps button.done { border-color: var(--color-ok-deep); }
.prac-steps button.done i::before { content: '✓'; }

/* Locked step */
.prac-steps button.locked { opacity: 0.7; cursor: not-allowed; }
.prac-steps button.locked i::before { content: '🔒'; }
```

### Progress Bar

Non-exam modes display a progress indicator:

```html
<div class="step-progress">
  <div class="step-progress-bar">
    <div class="step-progress-fill" style="width: 50%"></div>
  </div>
  <span class="step-progress-text"><strong>3</strong> / 6</span>
</div>
```

### Score/Report Readability (钢板/焊缝/均值/区域)

Improved table and key-value styling for evaluation feedback:
- `.pc-table` — Consistent header styling, alternating row hints
- `.pc-kv` — Grid layout for key-value pairs
- `.pc-sub` — Section headers with bottom border
- `.exam-eval` — Verdict comparison panel
- Status indicators: `.ok` (green), `.ng` (red), `.use` (blue accent)

### Motion Integration

Phase D wires these motion helpers to the guidance UI:

| Call Site | Function | Effect |
|-----------|----------|--------|
| `buildSteps()` onclick | `stepAdvance()` | Pulse feedback on step click |
| `updateGuide()` | `highlightPulse()` | Highlight current checklist item |

### Trainee Main Path

After Phase D, a new trainee can follow the straight-probe practice flow without a manual:

1. **Step bar** — Clear visual of current position and completed steps
2. **Progress indicator** — Shows X / 6 steps done
3. **Locked steps** — Obvious 🔒 icon with disabled state
4. **Guide checklist** — Current item highlighted, sub-items expandable
5. **Blocking feedback** — Toast messages explain why an action failed
6. **Done indicator** — ✓ checkmark on completed steps

### Files Changed

| File | Change |
|------|--------|
| `src/ui/step-guidance.css` | New — unified guidance styles |
| `src/main.js` | Import new CSS, enhance `buildSteps()`, wire `highlightPulse()` |
| `docs/classroom-flow.md` | New — state diagram documentation |
| `docs/ui-upgrade.md` | Phase D section added |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Baseline | Pre-upgrade snapshot (tag: `pre-upgrade`) |
| 1.1.0 | Phase A/B | Token system, layout unification |
| 1.2.0 | Phase C | GSAP motion layer, toast/step/panel animations |
| 1.3.0 | Phase D | Classroom flow guidance UX, step states, report readability |
