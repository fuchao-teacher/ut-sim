# Classroom Main Path State Diagram

This document describes the step state machines and classroom flow for the 直探头 UT 仿真 webapp.

## Practice Workflow Steps

The practice workflow consists of 6 sequential steps defined in `practiceDoc.steps`:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  CALIBRATE   │────▶│     DAC      │────▶│ SENSITIVITY  │
│  校准        │     │  DAC曲线     │     │  灵敏度      │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │ done.calibrate     │ done.dac           │ done.sensitivity
       ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     SCAN     │────▶│   QUANTIFY   │────▶│   EVALUATE   │
│  扫查        │     │  定量        │     │  评定        │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │ found.length > 0   │ results[target]    │ submitted
       ▼                    ▼                    ▼
   [indicators]        [measurements]       [final grade]
```

## Step State Machine

Each step has three possible states:

| State | CSS Class | Visual | Description |
|-------|-----------|--------|-------------|
| **Locked** | `.locked` | 🔒 | Prerequisite step(s) not complete |
| **Open** | (default) | 🔵 | Ready to work on |
| **Done** | `.done` | ✓ | Step completed successfully |
| **Current** | `.on` | ⬤ | Active step being worked on |

### State Transitions

```
 LOCKED ──────▶ OPEN ──────▶ DONE
    ▲            │             │
    │            │             │
    └────────────┴─────────────┘
         (clearFrom: step reset)
```

## Entry Flows by Learning Mode

### 1. Student Mode (S.learning.role === 'student')

```
                ┌─────────────────┐
                │  Role Selection │
                │  选择学习模式   │
                └────────┬────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  学习    │    │  实训    │    │  考核    │
   │ (theory) │    │(practice)│    │  (exam)  │
   └────┬─────┘    └────┬─────┘    └────┬─────┘
        │               │               │
        ▼               ▼               ▼
   Theory pages    Equipment →     Equipment →
                   Practice flow   Exam flow
```

### 2. Detection Training (V5 / 缺陷检测实训)

Simplified flow with only 3 steps:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     SCAN     │────▶│   QUANTIFY   │────▶│   EVALUATE   │
│  扫查        │     │  定量        │     │  评定        │
└──────────────┘     └──────────────┘     └──────────────┘
```

- Calibration/DAC/Sensitivity preset automatically
- Focus is on defect detection, sizing, and grading

### 3. Full Study Flow (学习模式)

Includes equipment assembly step:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  ASSEMBLY    │────▶│  CALIBRATE   │────▶│     DAC      │
│  设备组装    │     │  校准        │     │  DAC曲线     │
└──────────────┘     └──────────────┘     └──────────────┘
       ▼                    ▼                    ▼
     [...]              [...]               [...]
```

## Blocking Reasons

Steps can be blocked for various reasons. The guidance UI should display these clearly:

### calibrate
| Blocker | Message | Resolution |
|---------|---------|------------|
| Wrong specimen | `use_specimen` | Switch to reference block |
| Points invalid | `out_of_tol` | Re-record calibration points |
| Interval wrong | `interval` | Adjust recorded echoes |

### dac
| Blocker | Message | Resolution |
|---------|---------|------------|
| Calibration void | `calib_void` | Complete calibration first |
| Wrong specimen | `use_specimen` | Switch to DAC specimen |

### sensitivity
| Blocker | Message | Resolution |
|---------|---------|------------|
| DAC incomplete | (step locked) | Complete DAC curve |
| Gain mismatch | tolerance check | Adjust gain to scan level |

### scan
| Blocker | Message | Resolution |
|---------|---------|------------|
| Sensitivity not set | (step locked) | Complete sensitivity step |
| Gate off | `gate_required` | Turn gate on |
| No echo visible | `no_visible` | Position probe on defect |
| Panel frozen | `frozen` | Unfreeze display |

### quantify
| Blocker | Message | Resolution |
|---------|---------|------------|
| No target selected | visual cue | Select a defect to measure |
| Insufficient points | `boundary X / Y` | Record more boundary points |

### evaluate
| Blocker | Message | Resolution |
|---------|---------|------------|
| Missing quant data | `need_quant` | Complete quantification |
| Incomplete form | `need_choice` | Fill all evaluation fields |

## Guide Checklist System

Each step has sub-items tracked in `guideChecks(step)`:

### calibrate
- [ ] spec: Using calibration specimen
- [ ] gain: Gain set correctly
- [ ] echo: Echo visible at target
- [ ] point: Point recorded

### dac
- [ ] spec: Using DAC specimen
- [ ] hole1–N: Each hole recorded

### sensitivity
- [ ] comp: Compensation applied
- [ ] scan: Scan sensitivity set

### scan
- [ ] spec: On evaluation plate
- [ ] move: Sufficient coverage
- [ ] flag: Indication(s) marked

### quantify
- [ ] target: Defect selected
- [ ] points: Boundary measured
- [ ] eq: Equivalent calculated
- [ ] result: Result confirmed

### evaluate
- [ ] level: Level selected
- [ ] verdict: Verdicts assigned
- [ ] submit: Evaluation submitted

## Exam Mode Specifics

When `S.exam === true`:

1. **No guide overlay** (`S.prac.guide = false`)
2. **No x-ray mode** (`S.prac.xray = false`)
3. **Bench assembly required first** (`S.prac.asmDone`)
4. **Single submission** (`S.prac.submitted` locks everything)
5. **Steps unlock sequentially** (no presets)

## Data Flow Summary

```
S.prac.step          ← current step ID
S.prac.done[stepId]  ← completion boolean per step
S.prac.calib         ← calibration data
S.prac.dac           ← DAC curve data
S.prac.sens          ← sensitivity data
S.prac.scan          ← scan results
S.prac.quant         ← quantification data
S.prac.eval          ← evaluation data
S.prac.submitted     ← final submission flag
```

## Integration Points (Phase D)

The guidance UI wires into:

1. **buildSteps()** - Renders step bar with state classes
2. **renderPracState()** - Updates step bar on state change
3. **guideChecks()** - Returns sub-item completion state
4. **pracFail()** - Shows blocking reason
5. **panelMsg()** - Shows transient feedback

Motion helpers from Phase C:
- `stepAdvance(button)` - Pulse on step click
- `panelToggle(el, expand)` - Guide/standard panel expand
- `highlightPulse(el)` - Draw attention to blocked item
- `toastIn/Out` - Feedback messages
