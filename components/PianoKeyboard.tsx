import React from 'react';

interface PianoKeyboardProps {
  currentNote: number;
  onNoteSelect: (note: number) => void;
  scaleType?: string; // Future expansion
}

const OCTAVES = 2;
const START_OCTAVE = 3; // Start at C3

const PianoKeyboard: React.FC<PianoKeyboardProps> = ({ currentNote, onNoteSelect }) => {
  const isBlackKey = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
  
  const keys = [];
  const startNote = START_OCTAVE * 12; // C3 = 48
  const endNote = startNote + (OCTAVES * 12); // 2 octaves

  for (let i = startNote; i < endNote; i++) {
    keys.push(i);
  }

  return (
    <div className="relative h-32 flex select-none overflow-x-auto overflow-y-hidden bg-slate-900 border border-slate-700 rounded-lg">
      {keys.map((note) => {
        const isBlack = isBlackKey(note);
        const isSelected = note === currentNote;
        
        // Render white keys as flex items
        if (!isBlack) {
          return (
            <div
              key={note}
              onMouseDown={() => onNoteSelect(note)}
              className={`relative flex-shrink-0 w-10 h-full border-r border-slate-400 cursor-pointer active:bg-cyan-200 transition-colors
                ${isSelected ? 'bg-cyan-500' : 'bg-white'}
                first:rounded-l-lg last:rounded-r-lg last:border-r-0`}
            >
               {isSelected && <div className="absolute bottom-2 w-full text-center text-xs font-bold text-slate-900">C{Math.floor(note/12)-1}</div>}
            </div>
          );
        }
        return null;
      })}
      
      {/* Overlay Black Keys absolute */}
      <div className="absolute top-0 left-0 flex h-20 w-full pointer-events-none">
         {/* We need to mimic the spacing of the white keys loop to place black keys */}
         {keys.map((note, idx) => {
             if (!isBlackKey(note)) return <div key={`spacer-${note}`} className="w-10 flex-shrink-0 pointer-events-none" />;
             
             // If it is a black key, it needs to sit between the previous white key and the next.
             // However, in this simple loop, we can just hack the positioning by using negative margins on a flex container 
             // or absolute positioning based on index.
             // Easier approach for this component: 
             // Just render black keys with absolute positioning calculated from their note index relative to white keys.
             return null;
         })}
      </div>

       {/* Re-render specifically for absolute black keys to get z-index right without complex flex hacking */}
       {keys.map((note) => {
          if (!isBlackKey(note)) return null;
          
          // Calculate position
          // C is 0. C# is 0.5? No.
          // White keys are width 40px (w-10).
          // C, D, E, F, G, A, B
          // Indices in octave: 0, 2, 4, 5, 7, 9, 11
          // We need to know how many white keys preceded this note in this sequence.
          const noteInOctave = note % 12;
          const octave = Math.floor(note / 12) - START_OCTAVE;
          
          let whiteKeyIndex = 0;
          if (noteInOctave > 0) whiteKeyIndex++; // C# -> after C (1st white)
          if (noteInOctave > 2) whiteKeyIndex++; // D# -> after D (2nd white)
          if (noteInOctave > 4) whiteKeyIndex++; 
          if (noteInOctave > 5) whiteKeyIndex++; // F#
          if (noteInOctave > 7) whiteKeyIndex++; // G#
          if (noteInOctave > 9) whiteKeyIndex++; // A#
          
          // Absolute offset = (octave * 7 * 40px) + (whiteKeyIndex * 40px) - (half black key width)
          const leftPos = (octave * 7 * 40) + (whiteKeyIndex * 40) - 12; 

          const isSelected = note === currentNote;

          return (
            <div
               key={note}
               onMouseDown={(e) => { e.stopPropagation(); onNoteSelect(note); }}
               style={{ left: `${leftPos}px` }}
               className={`absolute top-0 w-6 h-20 border border-slate-800 rounded-b-md cursor-pointer z-10 transition-colors
                ${isSelected ? 'bg-cyan-600' : 'bg-slate-800'}
                active:bg-cyan-400 hover:bg-slate-700`}
            />
          );
       })}
    </div>
  );
};

export default PianoKeyboard;