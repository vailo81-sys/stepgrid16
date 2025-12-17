
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
const BASE_OCTAVE = 3; // Start at C3 (MIDI 48) by default

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

  // Generate all keys in range
  const keys = useMemo(() => {
    const k = [];
    for (let i = startNote; i < endNote; i++) {
      k.push(i);
    }
    return k;
  }, [startNote, endNote]);

  // Determine if a note is in the selected scale
  const isInScale = (note: number) => {
    const noteInOctave = note % 12;
    // Normalize to root
    const interval = (noteInOctave - rootNote + 12) % 12;
    return SCALES[scaleType].includes(interval);
  };

  const displayKeys = scaleFold ? keys.filter(isInScale) : keys;
  const isBlackKey = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);

  return (
    <div className="flex flex-col gap-2 w-full">
      
      {/* Piano Keys Container */}
      <div className="relative h-28 flex select-none bg-slate-900 border border-slate-700 rounded-lg overflow-hidden w-full group shadow-inner">
        {scaleFold ? (
          // Folded View: Linear keys, all equal width
          <div className="flex w-full h-full overflow-x-auto">
            {displayKeys.map((note) => {
              const isSelected = note === currentNote;
              const noteName = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][note % 12];
              const octave = Math.floor(note/12) - 1;
              
              return (
                <div
                  key={note}
                  onMouseDown={() => onNoteSelect(note)}
                  className={`
                    flex-1 min-w-[30px] border-r border-slate-700 h-full flex items-end justify-center pb-2 cursor-pointer
                    transition-colors active:bg-cyan-200
                    ${isSelected ? 'bg-cyan-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}
                  `}
                >
                  <div className="text-[10px] font-bold transform -rotate-90 mb-2 whitespace-nowrap">
                    {noteName}{octave}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Chromatic View (Standard Piano)
          <div className="relative w-full h-full overflow-x-auto overflow-y-hidden flex">
               {displayKeys.map((note) => {
                 if (isBlackKey(note)) return null; // Render whites first
                 const isSelected = note === currentNote;
                 const inScale = isInScale(note);
                 
                 return (
                   <div
                     key={note}
                     onMouseDown={() => onNoteSelect(note)}
                     className={`
                       relative flex-shrink-0 w-10 h-full border-r border-slate-400 cursor-pointer active:bg-cyan-200 transition-colors
                       ${isSelected ? 'bg-cyan-500' : 'bg-white'}
                       ${!inScale && !isSelected ? 'bg-slate-300' : ''} 
                     `}
                   >
                      {isSelected && <div className="absolute bottom-2 w-full text-center text-[10px] font-bold text-slate-900">
                        C{Math.floor(note/12)-1}
                      </div>}
                      {!inScale && !isSelected && <div className="absolute bottom-1 w-full text-center text-[8px] text-slate-500">×</div>}
                   </div>
                 );
               })}

              {/* Black Keys Overlay */}
               {displayKeys.map((note) => {
                 if (!isBlackKey(note)) return null;
                 
                 // Calculate position relative to white keys
                 // Indices in octave: 0, 2, 4, 5, 7, 9, 11 (White)
                 const noteInOctave = note % 12;
                 const octave = Math.floor(note / 12) - currentStartOctave;
                 
                 let whiteKeyIndex = 0;
                 if (noteInOctave > 0) whiteKeyIndex++;
                 if (noteInOctave > 2) whiteKeyIndex++;
                 if (noteInOctave > 4) whiteKeyIndex++; 
                 if (noteInOctave > 5) whiteKeyIndex++;
                 if (noteInOctave > 7) whiteKeyIndex++;
                 if (noteInOctave > 9) whiteKeyIndex++;
                 
                 const leftPos = (octave * 7 * 40) + (whiteKeyIndex * 40) - 12; // 40px width per white key, 24px black key width
                 const isSelected = note === currentNote;
                 const inScale = isInScale(note);

                 return (
                   <div
                      key={note}
                      onMouseDown={(e) => { e.stopPropagation(); onNoteSelect(note); }}
                      style={{ left: `${leftPos}px` }}
                      className={`
                        absolute top-0 w-6 h-16 border border-slate-800 rounded-b-md cursor-pointer z-10 transition-colors
                        ${isSelected ? 'bg-cyan-600' : (inScale ? 'bg-slate-900' : 'bg-slate-700 opacity-50')}
                        hover:bg-cyan-700
                      `}
                   />
                 );
               })}
          </div>
        )}
      </div>

      {/* Octave Controls Row (Below Input) */}
      <div className="flex justify-center items-center">
         <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-800">
             <button 
                onClick={(e) => { e.stopPropagation(); setOctaveShift(s => Math.max(s - 2, -2)); }} // Limit low range
                className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors"
                title="Octave Down"
             >
                <ChevronLeft size={16} />
             </button>
             <div className="px-3 text-[10px] font-mono font-bold text-cyan-500 min-w-[4rem] text-center border-x border-slate-700/50">
                OCTAVE {currentStartOctave}
             </div>
             <button 
                onClick={(e) => { e.stopPropagation(); setOctaveShift(s => Math.min(s + 2, 6)); }} // Limit high range
                className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors"
                title="Octave Up"
             >
                <ChevronRight size={16} />
             </button>
         </div>
      </div>

    </div>
  );
};

export default PianoKeyboard;
