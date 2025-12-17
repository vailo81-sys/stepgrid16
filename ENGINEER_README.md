# StepGrid16 — Engineer README

## Phase 1: COMPLETE

This document marks the formal completion of Phase 1 of StepGrid16 and defines the engineering boundaries that apply going forward.

If you are reading this, assume:
- Phase 1 behavior is locked
- Changes to Phase 1 must be bug fixes only
- New ideas belong in Phase 2 or later

### 1. What StepGrid16 Is
StepGrid16 is a standalone, deterministic, 16-step MIDI execution grid.
It exists to execute musical decisions precisely, not to generate ideas, suggest content, or assist creatively.
It is governed by the StepGrid16 Manifesto. If a feature conflicts with the manifesto, it does not belong.

### 2. Phase 1 Definition (Now Locked)
Phase 1 delivers the core machine.
Phase 1 guarantees:
- A fixed 16-step grid
- Fully explicit per-step state
- Deterministic playback
- No hidden behavior
- No generative logic
- No AI dependency
- No network dependency

Phase 1 is considered complete when the system can:
- Author patterns
- Play them accurately
- Chain them explicitly
- Export exactly what it plays
- Persist state locally
- Safely control external MIDI hardware

All of the above are now implemented.

### 3. Runtime Architecture (Phase 1)
**Core Components**
- React + TypeScript
- Vite build system
- Web MIDI API
- Web Audio clock (timing only, no audio generation)

**There are no runtime dependencies on:**
- APIs
- AI services
- API keys
- Internet access

If the machine is offline, StepGrid16 still works fully.

### 4. Sequencing Engine (Authoritative Behavior)
**Timing Model**
- Global tempo (BPM)
- Fixed 16-step cycle
- Each step equals one 16th note

**There is:**
- ❌ no global swing
- ❌ no groove templates
- ❌ no probabilistic timing

**Microtiming (Locked)**
- Microtiming is a per-step millisecond offset.
- Range: -50ms to +50ms
- Applied to note start time only
- Does not affect duration
- Does not affect tempo
- Does not affect other steps

This definition applies consistently to:
- Live playback
- Grid visualization
- MIDI export

This is a hard contract.

### 5. Step Data Model (Explicit by Design)
Each step explicitly owns:
- active (on/off)
- note (MIDI pitch)
- velocity (0–127)
- gate (percentage of step)
- microTiming (milliseconds)
- macroA (CC 20)
- macroB (CC 21)

**There are:**
- ❌ no implied defaults
- ❌ no hidden scaling
- ❌ no context-based reinterpretation

If it is not visible, it does not exist.

### 6. Patterns, Banks, and Chaining
**Patterns**
- 8 patterns
- Manual selection only

**Chaining**
- Chains are explicitly authored
- Chain order is visible
- No automatic song mode

**Chain Looping**
- Looping is explicit
- Controlled by a visible chainLoop state
- Never implied
- Never automatic

This prevents hidden arrangement logic.

### 7. Input & Scale Policy
**Keyboard Input**
- Neutral pitch entry
- No correction
- No assistance

**Scale Fold**
- Restricts input only
- Does not modify existing notes
- Always visible
- Never inferred

Scale is treated as a constraint, not a teaching or creative tool.

### 8. UI Principles (Single-Screen Truth)
All essential state is visible on one screen:
- Grid
- Step parameters
- Pattern selection
- Chain state
- Scale/key
- Transport

**There are:**
- ❌ no pages
- ❌ no modes
- ❌ no hidden editors

Deprecated components (e.g. StepEditor) remain unused to enforce this rule.

### 9. Persistence (Phase 1 Complete)
StepGrid16 persists state via localStorage:
- Patterns
- Chain configuration
- Scale/key/fold
- Tempo
- MIDI channel/output

Persistence is:
- Local
- Explicit
- Offline
- Deterministic

No cloud sync is involved.

### 10. MIDI Safety Guarantees
Phase 1 includes full MIDI hygiene:
- All Notes Off
- All Sound Off
- Reset Controllers

These are triggered on:
- Stop
- MIDI output change
- Window blur
- Tab visibility change

This prevents stuck notes and undefined hardware states.

### 11. MIDI Export Contract
MIDI export is bit-for-bit consistent with live playback:
- Microtiming uses the same ms-based conversion
- Note-on timing matches playback
- Gate defines duration
- CC events align with note-on
- Negative offsets are safely clamped

Export is not an approximation. It is a render of the same engine.

### 12. AI Policy (Important)
AI tools (e.g. Google AI Studio) may be used during development only.
They are:
- Not bundled
- Not required
- Not referenced at runtime
- Not depended upon by any feature

StepGrid16 must always:
- Build offline
- Run offline
- Play offline
- Export offline

This is non-negotiable.

### 13. What Phase 1 Will NOT Accept
Phase 1 is closed to:
- New creative features
- Groove engines
- Probability
- Generative behavior
- AI-assisted composition
- UI abstraction layers
- “Just one more helper”

Any such idea belongs in Phase 2+, or not at all.

### 14. Phase 2 Entry Conditions
Phase 2 may begin only after Phase 1 is frozen.
Phase 2 must:
- Respect Phase 1 invariants
- Not mutate Phase 1 behavior
- Build on top of, not inside, the core engine

Phase 1 is now a foundation, not a playground.

### 15. Final Declaration
Phase 1 of StepGrid16 is complete.
The system is:
- Deterministic
- Explicit
- Standalone
- Export-accurate
- Manifesto-compliant

All future work proceeds from this base.
If something feels “clever,” “helpful,” or “smart,” it probably does not belong.
Clarity is the feature.