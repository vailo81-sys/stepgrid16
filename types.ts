
export interface StepData {
  id: string;
  active: boolean;
  note: number;      // MIDI Note 0-127
  velocity: number;  // 0-127
  gate: number;      // 1-16 (Number of 16th steps)
  microTiming: number; // -50 to +50 (milliseconds offset)
  macroA: number;    // CC Value 0-127
  macroB: number;    // CC Value 0-127
}

export interface Pattern {
  id: number;
  name: string;
  steps: StepData[];
  length: number; // 1-16
}

export enum ScaleType {
  MAJOR = 'Major',
  NATURAL_MINOR = 'Natural Minor',
  HARMONIC_MINOR = 'Harmonic Minor',
  MELODIC_MINOR = 'Melodic Minor',
  DORIAN = 'Dorian',
  PHRYGIAN = 'Phrygian',
  LYDIAN = 'Lydian',
  MIXOLYDIAN = 'Mixolydian',
  LOCRIAN = 'Locrian',
  MAJOR_PENTATONIC = 'Major Pentatonic',
  MINOR_PENTATONIC = 'Minor Pentatonic',
  BLUES = 'Blues',
  WHOLE_TONE = 'Whole Tone',
  DIMINISHED_HW = 'Diminished (H-W)',
  DIMINISHED_WH = 'Diminished (W-H)',
}

// Fix: Define missing EditMode enum to resolve import errors in other components.
export enum EditMode {
  NOTE = 'NOTE',
  VELOCITY = 'VELOCITY',
  GATE = 'GATE',
  OFFSET = 'OFFSET',
  MACRO_A = 'MACRO_A',
  MACRO_B = 'MACRO_B',
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
  // Macro CCs
  macroCC_A: number; 
  macroCC_B: number;
}

export const SCALES: Record<ScaleType, number[]> = {
  [ScaleType.MAJOR]: [0, 2, 4, 5, 7, 9, 11],
  [ScaleType.NATURAL_MINOR]: [0, 2, 3, 5, 7, 8, 10],
  [ScaleType.HARMONIC_MINOR]: [0, 2, 3, 5, 7, 8, 11],
  [ScaleType.MELODIC_MINOR]: [0, 2, 3, 5, 7, 9, 11],
  [ScaleType.DORIAN]: [0, 2, 3, 5, 7, 9, 10],
  [ScaleType.PHRYGIAN]: [0, 1, 3, 5, 7, 8, 10],
  [ScaleType.LYDIAN]: [0, 2, 4, 6, 7, 9, 11],
  [ScaleType.MIXOLYDIAN]: [0, 2, 4, 5, 7, 9, 10],
  [ScaleType.LOCRIAN]: [0, 1, 3, 5, 6, 8, 10],
  [ScaleType.MAJOR_PENTATONIC]: [0, 2, 4, 7, 9],
  [ScaleType.MINOR_PENTATONIC]: [0, 3, 5, 7, 10],
  [ScaleType.BLUES]: [0, 3, 5, 6, 7, 10],
  [ScaleType.WHOLE_TONE]: [0, 2, 4, 6, 8, 10],
  [ScaleType.DIMINISHED_HW]: [0, 1, 3, 4, 6, 7, 9, 10],
  [ScaleType.DIMINISHED_WH]: [0, 2, 3, 5, 6, 8, 9, 11],
};
