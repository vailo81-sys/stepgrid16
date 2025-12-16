import { Pattern, StepData } from './types';
import { v4 as uuidv4 } from 'uuid'; // We will simulate uuid with a simple function since we don't have the lib

const generateId = () => Math.random().toString(36).substr(2, 9);

export const DEFAULT_TEMPO = 120;
export const DEFAULT_SWING = 0; // 0% swing (straight) - 50% is standard swing feel in some DAWs, but here we treat 0 as none, 0.5 as heavy.
export const TOTAL_STEPS = 16;
export const PATTERN_COUNT = 8;

export const createEmptyStep = (): StepData => ({
  id: generateId(),
  active: false,
  note: 60, // C4
  velocity: 100,
  gate: 50, // 50% length
  macroA: 64,
  macroB: 64,
});

export const createEmptyPattern = (index: number): Pattern => ({
  id: index,
  name: `Pattern ${index + 1}`,
  steps: Array.from({ length: TOTAL_STEPS }, createEmptyStep),
  length: 16,
});

export const INITIAL_PATTERNS: Pattern[] = Array.from({ length: PATTERN_COUNT }, (_, i) => createEmptyPattern(i));