
export interface StepData {
  id: string;
  active: boolean;
  note: number;      // MIDI Note 0-127
  velocity: number;  // 0-127
  gate: number;      // 1-100%
  microTiming: number; // -50 to +50 (milliseconds offset) - declaring microtiming as a temporal primitive
  macroA: number;    // CC20 Value 0-127
  macroB: number;    // CC21 Value 0-127
}

export interface Pattern {
  id: number;
  name: string;
  steps: StepData[];
  length: number; // 1-16
}

export enum ScaleType {
  CHROMATIC = 'Chromatic',
  MAJOR = 'Major',
  MINOR = 'Minor',
  PENTATONIC = 'Pentatonic',
  DORIAN = 'Dorian',
  PHRYGIAN = 'Phrygian',
}

export interface SequencerState {
  tempo: number;
  isPlaying: boolean;
  currentStep: number;
  activePatternIdx: number;
  midiChannel: number; // 1-16
  midiOutputId: string | null;
  // Scale / Key
  rootNote: number; // 0-11 (C=0)
  scaleType: ScaleType;
  scaleFold: boolean;
  // Chaining
  chain: number[]; // Array of pattern indices
  chainStep: number; // Current index in the chain array
  chainLoop: boolean; // Explicit loop policy
}

export const SCALES: Record<ScaleType, number[]> = {
  [ScaleType.CHROMATIC]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [ScaleType.MAJOR]: [0, 2, 4, 5, 7, 9, 11],
  [ScaleType.MINOR]: [0, 2, 3, 5, 7, 8, 10],
  [ScaleType.PENTATONIC]: [0, 2, 4, 7, 9],
  [ScaleType.DORIAN]: [0, 2, 3, 5, 7, 9, 10],
  [ScaleType.PHRYGIAN]: [0, 1, 3, 5, 7, 8, 10],
};
