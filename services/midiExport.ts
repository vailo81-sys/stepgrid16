
import { Pattern } from '../types';

// Simple MIDI Encoder
// Standard MIDI File Format (SMF) Type 0 (Single Track)
// PPQ = 480 (High resolution ticks per quarter note)
const PPQ = 480; 

function strToBytes(str: string): number[] {
  return str.split('').map(c => c.charCodeAt(0));
}

function numToBytes(num: number, bytes: number): number[] {
  const arr = [];
  for (let i = bytes - 1; i >= 0; i--) {
    arr.push((num >> (8 * i)) & 0xFF);
  }
  return arr;
}

function toVLQ(num: number): number[] {
  let buffer = num & 0x7F;
  while ((num >>= 7)) {
    buffer <<= 8;
    buffer |= (num & 0x7F) | 0x80;
  }
  const arr = [];
  while (true) {
    arr.push(buffer & 0xFF);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return arr;
}

interface MidiEvent {
  tick: number;
  data: number[];
}

export const downloadMidi = (patterns: Pattern[], chain: number[], activePatternIdx: number, tempo: number) => {
  // Determine sequence: Chain or Single Pattern
  const sequencePatterns: Pattern[] = [];
  if (chain.length > 0) {
    chain.forEach(idx => sequencePatterns.push(patterns[idx]));
  } else {
    sequencePatterns.push(patterns[activePatternIdx]);
  }

  const events: MidiEvent[] = [];
  let currentTick = 0;
  const ticksPerSixteenth = PPQ / 4; // 120 ticks

  sequencePatterns.forEach(pattern => {
    pattern.steps.forEach((step) => {
      // Base start time of this step slot
      const stepStartTick = currentTick;
      
      if (step.active) {
        // Calculate Microtiming
        // Range -50 to +50. 
        // offset = (microTiming / 100) * ticksPerSixteenth
        const offset = Math.round((step.microTiming / 100) * ticksPerSixteenth);
        const noteOnTick = stepStartTick + offset;
        
        // Calculate Duration
        // gate 1-100%
        const duration = Math.round((step.gate / 100) * ticksPerSixteenth);
        const noteOffTick = noteOnTick + duration;

        // CC Macros (20 & 21)
        // We place CCs at the NoteOn time to ensure parameters are set for the note
        events.push({
            tick: Math.max(0, noteOnTick),
            data: [0xB0, 20, step.macroA]
        });
        events.push({
            tick: Math.max(0, noteOnTick),
            data: [0xB0, 21, step.macroB]
        });

        // Note On
        events.push({
          tick: Math.max(0, noteOnTick),
          data: [0x90, step.note, step.velocity]
        });

        // Note Off
        events.push({
          tick: Math.max(0, noteOffTick),
          data: [0x80, step.note, 0]
        });
      }

      currentTick += ticksPerSixteenth;
    });
  });

  // End of Track buffer (1 beat)
  const endTick = Math.max(currentTick, ...events.map(e => e.tick)) + PPQ;

  // Sort events by tick
  events.sort((a, b) => a.tick - b.tick);

  // Generate Track Data
  const trackBytes: number[] = [];
  
  // 1. Set Tempo Event at tick 0
  // FF 51 03 tttttt
  // Microseconds per quarter note = 60,000,000 / tempo
  const mpqn = Math.round(60000000 / tempo);
  trackBytes.push(0); // Delta 0
  trackBytes.push(0xFF, 0x51, 0x03, ...numToBytes(mpqn, 3));

  // 2. Events
  let lastTick = 0;
  events.forEach(e => {
    const delta = Math.max(0, e.tick - lastTick); // Ensure no negative delta
    trackBytes.push(...toVLQ(delta));
    trackBytes.push(...e.data);
    lastTick = e.tick;
  });

  // 3. End of Track
  const deltaEnd = endTick - lastTick;
  trackBytes.push(...toVLQ(deltaEnd));
  trackBytes.push(0xFF, 0x2F, 0x00);

  // Build Header Chunk
  const headerBytes = [
    ...strToBytes('MThd'),
    ...numToBytes(6, 4), // Header length
    ...numToBytes(0, 2), // Format 0 (Single Track)
    ...numToBytes(1, 2), // 1 Track
    ...numToBytes(PPQ, 2) // Division
  ];

  // Build Track Chunk Header
  const trackChunkHeader = [
    ...strToBytes('MTrk'),
    ...numToBytes(trackBytes.length, 4)
  ];

  // Combine
  const fileBytes = new Uint8Array([...headerBytes, ...trackChunkHeader, ...trackBytes]);
  
  // Create Download
  const blob = new Blob([fileBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stepgrid16_${new Date().toISOString().slice(0,10)}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
