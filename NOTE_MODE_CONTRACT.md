
# StepGrid16 — NOTE MODE CONTRACT

## 1. Purpose
NOTE mode exists for direct pitch entry. It is not a keyboard, not a piano roll, not a scale editor. It answers one question only: “What pitch does this step play?”

## 2. Authority Rules
NOTE mode owns the grid when active. When NOTE mode is selected:
- Pad presses must resolve to a pitch
- No other mode may intercept or override pad input
- UI state must reflect pitch intent, not parameter intent

## 3. Determinism
In NOTE mode:
- Every visible pad maps to exactly one pitch
- That mapping must be: Predictable, Audible, Repeatable
- No pad may: Emit null, Emit silence, Emit a conditional value based on hidden state

## 4. Separation of Concerns
These systems must never mutate pitch resolution:
- **Fold**: Affects visibility, not pitch data
- **Scale**: Filters allowed pitches, does not rewrite the grid
- **Chromatic**: Changes layout only, never introduces invalid pads
If pitch data changes, it must be explicit and visible.

## 5. Visibility Rule
NOTE mode must always show:
- Note name (e.g. C, D#, F)
- Octave context
- Current focus state
If a pad is visible, it must be playable.

## 6. Audible Guarantee
NOTE mode is invalid unless one of the following is true:
- MIDI output is connected
- Virtual MIDI is available
- Internal test oscillator is active
Silence = failure.

## 7. Safety Rule (Critical)
No refactor, optimization, or abstraction may:
- Change pad → pitch mapping
- Merge NOTE logic with parameter modes
- Share handlers that obscure pitch authority

If this contract is violated, the change must be reverted.

---
**NOTE mode is sacred. If NOTE mode breaks, the instrument is broken.**
