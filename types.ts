export interface StepData {
  id: string;
  active: boolean;
  note: number;      // MIDI Note 0-127
  velocity: number;  // 0-127
  gate: number;      // 1-100%
  macroA: number;    // CC20 Value 0-127
  macroB: number;    // CC21 Value 0-127
}

export interface Pattern {
  id: number;
  name: string;
  steps: StepData[];
  length: number; // 1-16
}

export interface SequencerState {
  tempo: number;
  swing: number; // 0-100% (50% is straight)
  isPlaying: boolean;
  currentStep: number;
  activePatternIdx: number;
  midiChannel: number; // 1-16
  midiOutputId: string | null;
}

export enum ScaleType {
  CHROMATIC = 'Chromatic',
  MAJOR = 'Major',
  MINOR = 'Minor',
  PENTATONIC = 'Pentatonic',
}

export const SCALES: Record<ScaleType, number[]> = {
  [ScaleType.CHROMATIC]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [ScaleType.MAJOR]: [0, 2, 4, 5, 7, 9, 11],
  [ScaleType.MINOR]: [0, 2, 3, 5, 7, 8, 10],
  [ScaleType.PENTATONIC]: [0, 2, 4, 7, 9],
};