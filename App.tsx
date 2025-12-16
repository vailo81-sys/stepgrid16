import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Settings, Music, Volume2, Info } from 'lucide-react';
import { 
  Pattern, StepData, SequencerState, 
} from './types';
import { 
  DEFAULT_TEMPO, INITIAL_PATTERNS, createEmptyPattern 
} from './constants';
import { midiService } from './services/midiService';
import StepEditor from './components/StepEditor';
import Knob from './components/Knob';

// Audio Context for precision timing
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

export default function App() {
  // State
  const [patterns, setPatterns] = useState<Pattern[]>(INITIAL_PATTERNS);
  const [state, setState] = useState<SequencerState>({
    tempo: DEFAULT_TEMPO,
    swing: 0,
    isPlaying: false,
    currentStep: -1,
    activePatternIdx: 0,
    midiChannel: 1,
    midiOutputId: null,
  });
  
  // Interaction State
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [midiOutputs, setMidiOutputs] = useState<{id: string, name: string}[]>([]);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);

  // Refs for timing engine to access latest state without re-renders
  const stateRef = useRef(state);
  const patternsRef = useRef(patterns);
  
  // Sync Refs
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { patternsRef.current = patterns; }, [patterns]);

  // Init MIDI
  useEffect(() => {
    midiService.initialize().then(() => {
      setMidiOutputs(midiService.getOutputs());
    });
  }, []);

  // Engine Refs
  const nextNoteTime = useRef<number>(0.0);
  const currentStepRef = useRef<number>(0);
  const timerID = useRef<number | null>(null);
  const lookahead = 25.0; // ms
  const scheduleAheadTime = 0.1; // s

  // Timing Engine
  const nextNote = useCallback(() => {
    const secondsPerBeat = 60.0 / stateRef.current.tempo;
    const sixteenthNoteTime = secondsPerBeat / 4; // 16th note

    // Apply Swing: odd steps are delayed
    // Swing factor: 0 = straight, 0.33 = triplet feel approx, 0.5 = hard swing
    // Simplified: Even steps (0, 2, 4...) are "on grid". Odd steps (1, 3, 5...) are delayed.
    // If we increment time purely by 16th, we just add `sixteenthNoteTime`.
    // To Implement Swing properly in a loop:
    // We update `nextNoteTime` based on whether the *current* step was swang or not?
    // Easier: Just add standard time, but when *scheduling* the event, add offset for odd steps.
    // Wait, the standard "nextNote" usually increments the grid pointer.
    
    // Let's stick to standard increment for grid, and apply offset in `scheduleNote`.
    nextNoteTime.current += sixteenthNoteTime;
    
    currentStepRef.current = (currentStepRef.current + 1) % 16;
  }, []);

  const scheduleNote = useCallback((stepNumber: number, time: number) => {
    // Update UI
    // We use a separate requestAnimationFrame for UI to not block audio, 
    // but here we just set state which triggers render. 
    // For high freq, optimize by using a ref-based visualizer or only updating changed steps.
    // React 18 batching helps.
    requestAnimationFrame(() => {
        setState(s => ({ ...s, currentStep: stepNumber }));
    });

    const pattern = patternsRef.current[stateRef.current.activePatternIdx];
    const step = pattern.steps[stepNumber];

    if (step && step.active) {
       // Calculate Swing Offset
       // If step is odd (1, 3, 5...), delay it.
       let swingOffset = 0;
       if (stepNumber % 2 !== 0) {
           const quarterNote = 60.0 / stateRef.current.tempo;
           // Swing 0-100 scales max delay. 
           // 50% swing roughly means the off-beat is 2/3rds of the way through.
           // Max realistic swing is usually around 1/12th of a beat delay?
           // Let's use a simple factor: max swing = 33% of a 16th note.
           swingOffset = (stateRef.current.swing / 100) * (quarterNote / 4);
       }

       const playTime = time + swingOffset;
       const duration = (step.gate / 100) * (60.0 / stateRef.current.tempo / 4);

       // Send MIDI
       midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 20, step.macroA);
       midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 21, step.macroB);
       midiService.sendNoteOn(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note, step.velocity);
       
       // Schedule Note Off
       // Web MIDI doesn't support scheduling in the future natively like AudioContext, 
       // so we use setTimeout for the "off" message relative to now.
       // However, this is less precise. 
       // Better pattern: The midiService methods just send immediately. 
       // We should use `setTimeout` in the main thread with the delay calculated from `playTime - audioCtx.currentTime`.
       
       const timeUntilPlay = (playTime - audioCtx.currentTime) * 1000;
       const durationMs = duration * 1000;

       if (timeUntilPlay > 0) {
           setTimeout(() => {
               // We might want to re-send NoteOn here if we want exact timing, 
               // but `scheduleNote` is called slightly ahead.
               // Actually, `midiService` sends immediately. 
               // If we want precision, we shouldn't send immediately in `scheduleNote` if `time` is in future.
               // But Web MIDI API doesn't support timestamps in `send` in all browsers robustly / it's complicated.
               // For this app, simplified "fire when scheduled" (which is ~100ms ahead) is okay, 
               // BUT for rhythm, we should try to match the AudioContext time.
               // Let's assume `send` happens now. 
               // To delay until `playTime`, we use setTimeout.
           }, timeUntilPlay); 
           
           // Correct implementation for "Time Scheduled" MIDI:
           // We just use setTimeout.
           setTimeout(() => {
               midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 20, step.macroA);
               midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 21, step.macroB);
               midiService.sendNoteOn(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note, step.velocity);
               
               setTimeout(() => {
                   midiService.sendNoteOff(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note);
               }, durationMs);
           }, timeUntilPlay);
       } else {
           // Play immediately
           midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 20, step.macroA);
           midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 21, step.macroB);
           midiService.sendNoteOn(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note, step.velocity);
           setTimeout(() => {
               midiService.sendNoteOff(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note);
           }, durationMs);
       }
    }
  }, []);

  const scheduler = useCallback(() => {
    // while there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    while (nextNoteTime.current < audioCtx.currentTime + scheduleAheadTime) {
        scheduleNote(currentStepRef.current, nextNoteTime.current);
        nextNote();
    }
    timerID.current = window.setTimeout(scheduler, lookahead);
  }, [nextNote, scheduleNote]);

  // Transport Controls
  const togglePlay = () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (!state.isPlaying) {
        // Start
        currentStepRef.current = 0;
        nextNoteTime.current = audioCtx.currentTime;
        setState(s => ({ ...s, isPlaying: true }));
        scheduler();
    } else {
        // Stop
        setState(s => ({ ...s, isPlaying: false, currentStep: -1 }));
        if (timerID.current) window.clearTimeout(timerID.current);
    }
  };

  // Step Interaction
  const handleStepClick = (index: number) => {
    const pattern = patterns[state.activePatternIdx];
    const newSteps = [...pattern.steps];
    newSteps[index] = {
        ...newSteps[index],
        active: !newSteps[index].active
    };
    const newPatterns = [...patterns];
    newPatterns[state.activePatternIdx] = { ...pattern, steps: newSteps };
    setPatterns(newPatterns);
  };

  const handleStepLongPress = (index: number) => {
      setEditingStepIndex(index);
  };
  
  // Custom Pointer events for "Hold to Edit"
  const handlePointerDown = (index: number) => {
      const timer = window.setTimeout(() => {
          handleStepLongPress(index);
      }, 300); // 300ms hold triggers edit
      setLongPressTimer(timer);
  };

  const handlePointerUp = (index: number) => {
      if (longPressTimer) {
          window.clearTimeout(longPressTimer);
          setLongPressTimer(null);
          // If we didn't trigger edit (timer cleared), treat as click
          if (editingStepIndex !== index) {
             handleStepClick(index);
          }
      }
  };

  // Step Update from Editor
  const handleStepUpdate = (updates: Partial<StepData>) => {
      if (editingStepIndex === null) return;
      
      const pattern = patterns[state.activePatternIdx];
      const newSteps = [...pattern.steps];
      newSteps[editingStepIndex] = {
          ...newSteps[editingStepIndex],
          ...updates
      };
      
      const newPatterns = [...patterns];
      newPatterns[state.activePatternIdx] = { ...pattern, steps: newSteps };
      setPatterns(newPatterns);
  };

  // UI Components
  const currentPattern = patterns[state.activePatternIdx];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans select-none">
      {/* Header / Global Stats */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center">
                <Music className="text-slate-900" size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">StepGrid<span className="text-cyan-500">16</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
             <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${state.isPlaying ? 'bg-green-500 animate-pulse' : 'bg-red-900'}`}></div>
                {state.isPlaying ? 'RUNNING' : 'STOPPED'}
             </div>
             <div>CH:{state.midiChannel}</div>
             <div>{state.midiOutputId ? 'MIDI OK' : 'NO MIDI'}</div>
        </div>
      </header>

      {/* Main Grid Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
         <div className="max-w-4xl w-full bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-800">
            
            {/* Pattern & Transport Row */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
               <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg">
                  {Array.from({length: 8}).map((_, i) => (
                      <button 
                        key={i}
                        onClick={() => setState(s => ({...s, activePatternIdx: i}))}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all
                            ${state.activePatternIdx === i 
                                ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/50 scale-110' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'}`}
                      >
                        {i + 1}
                      </button>
                  ))}
               </div>

               <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <label className="text-[10px] uppercase text-slate-500 font-bold mb-1">Tempo</label>
                    <input 
                      type="number" 
                      value={state.tempo}
                      onChange={(e) => setState(s => ({...s, tempo: parseInt(e.target.value) || 120}))}
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center text-cyan-400 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <label className="text-[10px] uppercase text-slate-500 font-bold mb-1">Swing</label>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={state.swing}
                      onChange={(e) => setState(s => ({...s, swing: parseInt(e.target.value)}))}
                      className="w-24 accent-cyan-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
               </div>

               <button 
                 onClick={togglePlay}
                 className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl
                    ${state.isPlaying 
                        ? 'bg-slate-800 text-red-500 hover:text-red-400 border-2 border-red-500/20' 
                        : 'bg-cyan-500 text-slate-900 hover:bg-cyan-400 hover:scale-105 shadow-cyan-500/20'}`}
               >
                 {state.isPlaying ? <Square fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
               </button>
            </div>

            {/* The Grid */}
            <div className="grid grid-cols-8 gap-3 md:gap-4 mb-8">
               {currentPattern.steps.map((step, idx) => {
                 const isCurrent = state.currentStep === idx;
                 const isActive = step.active;
                 
                 return (
                   <button
                     key={step.id}
                     onPointerDown={(e) => {
                         e.preventDefault(); // prevent text selection
                         handlePointerDown(idx);
                     }}
                     onPointerUp={(e) => {
                         e.preventDefault();
                         handlePointerUp(idx);
                     }}
                     onPointerLeave={() => {
                        if (longPressTimer) {
                            window.clearTimeout(longPressTimer);
                            setLongPressTimer(null);
                        }
                     }}
                     onContextMenu={(e) => {
                         e.preventDefault();
                         setEditingStepIndex(idx);
                     }}
                     className={`
                        aspect-square rounded-lg border-2 relative overflow-hidden transition-all duration-75 group
                        ${isCurrent ? 'ring-2 ring-white scale-105 z-10' : ''}
                        ${isActive 
                            ? 'bg-cyan-500/20 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]' 
                            : 'bg-slate-800 border-slate-700 hover:border-slate-500'}
                     `}
                   >
                     {isActive && (
                         <div className="absolute inset-0 bg-cyan-500 opacity-20 animate-pulse-slow"></div>
                     )}
                     
                     <div className="absolute top-1 left-2 text-[10px] font-mono text-slate-500 group-hover:text-white">
                         {idx + 1}
                     </div>
                     
                     {isActive && (
                        <div className="absolute bottom-1 right-2 text-xs font-bold text-cyan-400">
                            {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][step.note % 12]}
                            {Math.floor(step.note/12) - 1}
                        </div>
                     )}

                     {/* Visual Gate Indicator (Bar at bottom) */}
                     {isActive && (
                         <div 
                           className="absolute bottom-0 left-0 h-1 bg-cyan-400" 
                           style={{ width: `${step.gate}%` }} 
                         />
                     )}
                     {/* Velocity Opacity */}
                     {isActive && (
                         <div className="absolute inset-0 bg-cyan-400 mix-blend-overlay pointer-events-none" style={{ opacity: step.velocity / 255 }}></div>
                     )}
                   </button>
                 );
               })}
            </div>

            {/* Bottom Controls (MIDI & Info) */}
            <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-sm text-slate-400">
               <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                     <Settings size={16} />
                     <select 
                       className="bg-slate-950 border border-slate-700 rounded px-2 py-1 focus:outline-none"
                       value={state.midiOutputId || ''}
                       onChange={(e) => setState(s => ({...s, midiOutputId: e.target.value}))}
                     >
                       <option value="">Select MIDI Output...</option>
                       {midiOutputs.map(o => (
                           <option key={o.id} value={o.id}>{o.name}</option>
                       ))}
                     </select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase">CH</span>
                    <input 
                       type="number" min="1" max="16"
                       className="w-12 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center"
                       value={state.midiChannel}
                       onChange={(e) => setState(s => ({...s, midiChannel: parseInt(e.target.value)}))}
                    />
                  </div>
               </div>

               <div className="flex items-center gap-2 text-xs">
                 <Info size={14} className="text-cyan-500" />
                 <span>Hold step to edit parameters. Right-click works too.</span>
               </div>
            </div>
         </div>
      </main>

      {/* Editing Modal */}
      {editingStepIndex !== null && (
        <StepEditor 
          stepIndex={editingStepIndex}
          step={currentPattern.steps[editingStepIndex]}
          onClose={() => setEditingStepIndex(null)}
          onUpdate={handleStepUpdate}
        />
      )}
    </div>
  );
}