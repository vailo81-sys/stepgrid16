
import { Pattern } from '../types';

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
  const sequencePatterns: Pattern[] = [];
  if (chain.length > 0) chain.forEach(idx => sequencePatterns.push(patterns[idx]));
  else sequencePatterns.push(patterns[activePatternIdx]);

  const events: MidiEvent[] = [];
  let currentTick = 0;
  const ticksPerSixteenth = PPQ / 4; 

  sequencePatterns.forEach(pattern => {
    pattern.steps.forEach((step, stepIdx) => {
      const stepStartTick = currentTick;
      
      if (step.active) {
        step.notes.forEach(note => {
          const swingOffsetMs = (stepIdx % 2 === 1) ? ((60.0 / tempo / 4) * 1000 * (step.swing / 100) * 0.5) : 0;
          const msToTicks = (tempo * PPQ / 60000);
          const offsetTicks = Math.round((note.microTiming + swingOffsetMs) * msToTicks);
          const noteOnTick = Math.max(0, stepStartTick + offsetTicks);
          const duration = Math.round(note.gate * ticksPerSixteenth);
          const velocity = step.accent ? Math.min(127, note.velocity * 1.5) : note.velocity;

          events.push({ tick: noteOnTick, data: [0xB0, 20, note.macroA] });
          events.push({ tick: noteOnTick, data: [0xB0, 21, note.macroB] });
          events.push({ tick: noteOnTick, data: [0x90, note.pitch, velocity] });
          events.push({ tick: noteOnTick + duration, data: [0x80, note.pitch, 0] });
        });
      }
      currentTick += ticksPerSixteenth;
    });
  });

  const endTick = currentTick + PPQ;
  events.sort((a, b) => a.tick - b.tick);

  const trackBytes: number[] = [];
  const mpqn = Math.round(60000000 / tempo);
  trackBytes.push(0, 0xFF, 0x51, 0x03, ...numToBytes(mpqn, 3));

  let lastTick = 0;
  events.forEach(e => {
    const delta = Math.max(0, e.tick - lastTick);
    trackBytes.push(...toVLQ(delta), ...e.data);
    lastTick = e.tick;
  });
  trackBytes.push(...toVLQ(endTick - lastTick), 0xFF, 0x2F, 0x00);

  const headerBytes = [...strToBytes('MThd'), ...numToBytes(6, 4), ...numToBytes(0, 2), ...numToBytes(1, 2), ...numToBytes(PPQ, 2)];
  const trackChunkHeader = [...strToBytes('MTrk'), ...numToBytes(trackBytes.length, 4)];
  const fileBytes = new Uint8Array([...headerBytes, ...trackChunkHeader, ...trackBytes]);
  
  const blob = new Blob([fileBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stepgrid16_poly.mid`;
  a.click();
  URL.revokeObjectURL(url);
};
