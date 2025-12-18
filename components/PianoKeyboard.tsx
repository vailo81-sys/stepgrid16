import React, { useMemo, useState } from 'react';
import { SCALES, ScaleType } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PianoKeyboardProps {
  currentNote: number;
  onNoteSelect: (note: number) => void;
  rootNote: number;
  scaleType: ScaleType;
  scaleFold: boolean;
}

const OCTAVES = 2;
const BASE_OCTAVE = 3; 

const PianoKeyboard: React.FC<PianoKeyboardProps> = ({ 
  currentNote, 
  onNoteSelect,
  rootNote,
  scaleType,
  scaleFold 
}) => {
  const [octaveShift, setOctaveShift] = useState(0);

  const currentStartOctave = BASE_OCTAVE + octaveShift;
  const startNote = currentStartOctave * 12; 
  const endNote = startNote + (OCTAVES * 12); 

  const keys = useMemo(() => {
    const k = [];
    for (let i = startNote; i < endNote; i++) {
      k.push(i);
    }
    return k;
  }, [startNote, endNote]);

  const isInScale = (note: number) => {
    const noteInOctave = note % 12;
    const interval = (noteInOctave - rootNote + 12) % 12;
    return SCALES[scaleType].includes(interval);
  };

  const displayKeys = scaleFold ? keys.filter(isInScale) : keys;
  const isBlackKey = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);

  return (
    <div className="flex flex-col gap-1 w-full h-full">
      
      {/* COMPRESSED TERMINAL KEYBOARD */}
      <div className="h-[40px] bg-[var(--bg)] border border-[var(--line)] flex overflow-x-auto overflow-y-hidden select-none scrollbar-hide">
        {displayKeys.map((note) => {
          const isSelected = note === currentNote;
          const inScale = isInScale(note);
          const black = isBlackKey(note);
          const noteName = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][note % 12];
          
          return (
            <div
              key={note}
              onMouseDown={() => onNoteSelect(note)}
              className={`
                relative flex-shrink-0 flex-1 min-w-[14px] border-r border-[var(--line)] cursor-pointer flex flex-col items-center justify-between py-1 transition-none
                ${isSelected ? 'bg-[var(--text)] text-[var(--bg)] z-10' : inScale ? 'bg-[var(--panel)] sg-dim hover:bg-[var(--panel2)]' : 'bg-[var(--bg)] sg-disabled'}
              `}
            >
              <span className={`text-[6px] font-bold ${black ? 'opacity-10' : 'opacity-30'}`}>{noteName}</span>
              <div className={`w-full h-[2px] ${isSelected ? 'bg-[var(--bg)]' : black ? 'bg-[var(--panel2)]' : 'bg-transparent'}`} />
              <span className="text-[5px] font-bold opacity-10">{Math.floor(note/12)-1}</span>
              {!inScale && !isSelected && <div className="absolute inset-0 bg-black opacity-80 pointer-events-none" />}
            </div>
          );
        })}
      </div>

      <div className="h-4 flex items-center justify-between bg-[var(--panel)] border border-[var(--line)] px-2">
         <button 
            onClick={() => setOctaveShift(s => Math.max(s - 2, -2))}
            className="h-3 px-1.5 bg-[var(--panel2)] border border-[var(--line)] hover:bg-[var(--play)] sg-dim hover:text-[var(--text)] transition-none"
         >
            <ChevronLeft size={6} />
         </button>
         <div className="text-[7px] font-bold sg-disabled tracking-[0.5em] uppercase">
            REG_ADDR_OCT: {currentStartOctave}—{currentStartOctave + 1}
         </div>
         <button 
            onClick={() => setOctaveShift(s => Math.min(s + 2, 6))}
            className="h-3 px-1.5 bg-[var(--panel2)] border border-[var(--line)] hover:bg-[var(--play)] sg-dim hover:text-[var(--text)] transition-none"
         >
            <ChevronRight size={6} />
         </button>
      </div>

    </div>
  );
};

export default PianoKeyboard;