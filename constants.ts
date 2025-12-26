
import { Pattern, StepData, NoteData } from './types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const DEFAULT_TEMPO = 120;
export const TOTAL_STEPS = 16;
export const PATTERN_COUNT = 8;

export const VELOCITY_PRESETS = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127];
export const GATE_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
export const OFFSET_PRESETS = [-30, -25, -20, -15, -10, -5, -2, 0, 2, 5, 10, 15, 20, 25, 30, 40];
export const MACRO_PRESETS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 127];
export const SWING_PRESETS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 100];

export const createEmptyNote = (pitch = 60): NoteData => ({
  pitch,
  velocity: 100,
  gate: 1,
  microTiming: 0,
  macroA: 64,
  macroB: 64,
});

export const createEmptyStep = (): StepData => ({
  id: generateId(),
  active: false,
  notes: [],
  swing: 0,
  accent: false,
});

export const createEmptyPattern = (index: number): Pattern => ({
  id: index,
  name: `Pattern ${index + 1}`,
  steps: Array.from({ length: TOTAL_STEPS }, createEmptyStep),
  length: 16,
});

export const INITIAL_PATTERNS: Pattern[] = Array.from({ length: PATTERN_COUNT }, (_, i) => createEmptyPattern(i));
