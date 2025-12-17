
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Settings, Music, Link as LinkIcon, RefreshCw, Layers, Download } from 'lucide-react';
import { 
  Pattern, StepData, SequencerState, ScaleType, SCALES 
} from './types';
import { 
  DEFAULT_TEMPO, INITIAL_PATTERNS 
} from './constants';
import { midiService } from './services/midiService';
import { downloadMidi } from './services/midiExport';
import PianoKeyboard from './components/PianoKeyboard';
import Knob from './components/Knob';

// Audio Context
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

export default function App() {
  // --- Data State ---
  const [patterns, setPatterns] = useState<Pattern[]>(INITIAL_PATTERNS);
  const [state, setState] = useState<SequencerState>({
    tempo: DEFAULT_TEMPO,
    isPlaying: false,
    currentStep: -1,
    activePatternIdx: 0,
    midiChannel: 1,
    midiOutputId: null,
    rootNote: 0, // C
    scaleType: ScaleType.MINOR,
    scaleFold: false,
    chain: [],
    chainStep: 0
  });
  
  // --- UI State ---
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [midiOutputs, setMidiOutputs] = useState<{id: string, name: string}[]>([]);

  // Refs for Audio Engine
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

  // --- Engine Constants ---
  const nextNoteTime = useRef<number>(0.0);
  const currentStepRef = useRef<number>(0);
  const timerID = useRef<number | null>(null);
  const lookahead = 25.0; 
  const scheduleAheadTime = 0.1;

  // --- Sequencing Engine ---
  const nextNote = useCallback(() => {
    const secondsPerBeat = 60.0 / stateRef.current.tempo;
    const sixteenthNoteTime = secondsPerBeat / 4; 
    
    nextNoteTime.current += sixteenthNoteTime;
    
    const currentIdx = currentStepRef.current;
    
    // Pattern Advancement Logic
    // If we are at the end of a pattern (step 15 -> 0)
    if (currentIdx === 15) {
       const currentState = stateRef.current;
       if (currentState.chain.length > 0) {
          // Advance chain
          const nextChainStep = (currentState.chainStep + 1) % currentState.chain.length;
          const nextPatternIdx = currentState.chain[nextChainStep];
          
          // We update state for the UI, but we must also ensure the engine knows 
          // to pull from the new pattern immediately for the next step (0).
          setState(s => ({ 
              ...s, 
              chainStep: nextChainStep, 
              activePatternIdx: nextPatternIdx 
          }));
          // Sync refs immediately for the scheduler
          stateRef.current.chainStep = nextChainStep;
          stateRef.current.activePatternIdx = nextPatternIdx;
       }
    }

    currentStepRef.current = (currentStepRef.current + 1) % 16;
  }, []);

  const scheduleNote = useCallback((stepNumber: number, time: number) => {
    requestAnimationFrame(() => {
        setState(s => ({ ...s, currentStep: stepNumber }));
    });

    const patternIdx = stateRef.current.activePatternIdx;
    const pattern = patternsRef.current[patternIdx];
    const step = pattern.steps[stepNumber];

    if (step && step.active) {
       // Micro-timing
       // +/- 50% of a 16th note
       const secondsPerBeat = 60.0 / stateRef.current.tempo;
       const sixteenth = secondsPerBeat / 4;
       const offset = (step.microTiming / 100) * sixteenth; 
       
       const playTime = time + offset;
       const duration = (step.gate / 100) * sixteenth;

       midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 20, step.macroA);
       midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 21, step.macroB);

       // Simple scheduling
       const timeUntilPlay = (playTime - audioCtx.currentTime) * 1000;
       const durationMs = duration * 1000;

       if (timeUntilPlay > 0) {
           setTimeout(() => {
               midiService.sendNoteOn(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note, step.velocity);
               setTimeout(() => {
                   midiService.sendNoteOff(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note);
               }, durationMs);
           }, timeUntilPlay);
       } else {
           // Play immediately if we're slightly late (catch up)
           midiService.sendNoteOn(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note, step.velocity);
           setTimeout(() => {
               midiService.sendNoteOff(stateRef.current.midiOutputId, stateRef.current.midiChannel, step.note);
           }, durationMs);
       }
    }
  }, []);

  const scheduler = useCallback(() => {
    while (nextNoteTime.current < audioCtx.currentTime + scheduleAheadTime) {
        scheduleNote(currentStepRef.current, nextNoteTime.current);
        nextNote();
    }
    timerID.current = window.setTimeout(scheduler, lookahead);
  }, [nextNote, scheduleNote]);

  // --- Actions ---
  const togglePlay = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (!state.isPlaying) {
        currentStepRef.current = 0;
        stateRef.current.chainStep = 0; // Reset chain on start? Or resume? Let's reset.
        if (state.chain.length > 0) {
            setState(s => ({...s, chainStep: 0, activePatternIdx: s.chain[0]}));
            stateRef.current.activePatternIdx = state.chain[0]; // sync ref
        }
        nextNoteTime.current = audioCtx.currentTime;
        setState(s => ({ ...s, isPlaying: true }));
        scheduler();
    } else {
        setState(s => ({ ...s, isPlaying: false, currentStep: -1 }));
        if (timerID.current) window.clearTimeout(timerID.current);
    }
  };

  const handleStepClick = (index: number) => {
      const pattern = patterns[state.activePatternIdx];
      const newSteps = [...pattern.steps];
      const isActive = newSteps[index].active;
      
      // Toggle Active
      newSteps[index] = { ...newSteps[index], active: !isActive };
      
      // If turning ON, select it for editing.
      if (!isActive) setSelectedStepIdx(index);
      
      const newPatterns = [...patterns];
      newPatterns[state.activePatternIdx] = { ...pattern, steps: newSteps };
      setPatterns(newPatterns);
  };

  const handleStepRightClick = (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      setSelectedStepIdx(index);
  };

  const updateSelectedStep = (updates: Partial<StepData>) => {
      if (selectedStepIdx === null) return;
      
      const pattern = patterns[state.activePatternIdx];
      const newSteps = [...pattern.steps];
      newSteps[selectedStepIdx] = {
          ...newSteps[selectedStepIdx],
          ...updates
      };
      
      const newPatterns = [...patterns];
      newPatterns[state.activePatternIdx] = { ...pattern, steps: newSteps };
      setPatterns(newPatterns);
  };

  const handlePatternClick = (idx: number, isShift: boolean) => {
      if (isShift) {
          // Add to Chain
          setState(s => ({...s, chain: [...s.chain, idx]}));
      } else {
          // Select Pattern (Clears Chain)
          setState(s => ({...s, activePatternIdx: idx, chain: [], chainStep: 0}));
      }
  };

  const clearChain = () => {
      setState(s => ({...s, chain: []}));
  };

  // --- Render Helpers ---
  const currentPattern = patterns[state.activePatternIdx];
  const selectedStep = selectedStepIdx !== null ? currentPattern.steps[selectedStepIdx] : null;

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex flex-col font-sans select-none overflow-hidden">
      
      {/* --- HEADER --- */}
      <header className="bg-slate-900 border-b border-slate-800 p-3 flex justify-between items-center shrink-0 h-16">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center text-slate-900 shadow-lg shadow-cyan-500/20">
                    <Music size={20} />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white hidden md:block">StepGrid<span className="text-cyan-500">16</span></h1>
            </div>
            
            <div className="h-8 w-px bg-slate-700 mx-2"></div>

            <div className="flex items-center gap-2">
                <button 
                    onClick={togglePlay}
                    className={`w-10 h-10 rounded flex items-center justify-center transition-all
                        ${state.isPlaying 
                            ? 'bg-red-500/10 text-red-500 border border-red-500/50' 
                            : 'bg-slate-800 text-cyan-500 hover:bg-slate-700'}`}
                >
                    {state.isPlaying ? <Square size={16} fill="currentColor"/> : <Play size={16} fill="currentColor" />}
                </button>
                <div className="flex flex-col items-center justify-center bg-slate-800 rounded px-2 h-10 border border-slate-700">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Tempo</span>
                    <input 
                      type="number" 
                      value={state.tempo}
                      onChange={(e) => setState(s => ({...s, tempo: parseInt(e.target.value) || 120}))}
                      className="w-12 bg-transparent text-center text-cyan-400 font-mono text-sm focus:outline-none"
                    />
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <button 
                onClick={() => downloadMidi(patterns, state.chain, state.activePatternIdx, state.tempo)}
                className="flex items-center gap-2 px-3 h-8 rounded hover:bg-slate-800 text-slate-500 hover:text-cyan-400 transition-colors group"
                title="Export MIDI"
            >
                <Download size={18} />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline group-hover:text-cyan-400">Export MIDI</span>
            </button>
            <div className="h-6 w-px bg-slate-800"></div>
            <div className="flex items-center gap-2 bg-slate-800 p-1 rounded border border-slate-700">
                 <Settings size={14} className="text-slate-500 ml-1" />
                 <select 
                   className="bg-transparent text-xs text-slate-300 focus:outline-none w-32"
                   value={state.midiOutputId || ''}
                   onChange={(e) => setState(s => ({...s, midiOutputId: e.target.value}))}
                 >
                   <option value="">No MIDI Output</option>
                   {midiOutputs.map(o => (
                       <option key={o.id} value={o.id}>{o.name}</option>
                   ))}
                 </select>
            </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
         
         {/* TOP ROW: Patterns & Chain */}
         <div className="flex flex-col md:flex-row gap-4 shrink-0 h-[80px]">
             {/* Pattern Select */}
             <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-3 flex flex-col justify-center">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Patterns (Shift+Click to Chain)</span>
                    {state.chain.length > 0 && (
                        <div className="flex items-center gap-2 text-[10px] bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                            <LinkIcon size={10} className="text-cyan-400"/>
                            <span className="font-mono text-cyan-400 truncate max-w-[200px]">
                                {state.chain.map(i => i + 1).join('→')}
                            </span>
                            <button onClick={clearChain} className="text-slate-500 hover:text-white ml-1 border-l border-slate-700 pl-2"><RefreshCw size={10} /></button>
                        </div>
                    )}
                 </div>
                 <div className="flex gap-1 h-full">
                    {Array.from({length: 8}).map((_, i) => {
                        const isActive = state.activePatternIdx === i;
                        const isInChain = state.chain.includes(i);
                        return (
                          <button 
                            key={i}
                            onClick={(e) => handlePatternClick(i, e.shiftKey)}
                            className={`flex-1 rounded text-sm font-bold transition-all relative group
                                ${isActive 
                                    ? 'bg-cyan-500 text-slate-900 shadow-[0_0_10px_rgba(6,182,212,0.4)]' 
                                    : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}
                                ${isInChain && !isActive ? 'border-b-2 border-cyan-500' : ''}
                            `}
                          >
                            {i + 1}
                            {/* Chain Indicator Dot */}
                            {isInChain && (
                                <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_5px_rgba(6,182,212,0.8)]" />
                            )}
                          </button>
                        );
                    })}
                 </div>
             </div>
         </div>

         {/* MIDDLE: THE GRID */}
         <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-2xl relative overflow-hidden flex flex-col justify-center">
             <div className="grid grid-cols-8 gap-2 md:gap-4 h-full">
               {currentPattern.steps.map((step, idx) => {
                 const isCurrent = state.currentStep === idx;
                 const isSelected = selectedStepIdx === idx;
                 const isActive = step.active;
                 
                 // Velocity Opacity Calculation (0.3 to 1.0)
                 const velocityOpacity = 0.3 + (step.velocity / 127) * 0.7;

                 return (
                   <button
                     key={step.id}
                     onClick={() => handleStepClick(idx)}
                     onContextMenu={(e) => handleStepRightClick(e, idx)}
                     className={`
                        relative rounded-lg border transition-all duration-75 group flex flex-col items-center justify-between p-2
                        ${isCurrent ? 'ring-2 ring-white z-10' : ''}
                        ${isSelected ? 'border-cyan-400' : 'border-slate-700'}
                        ${!isActive ? 'bg-slate-950 hover:bg-slate-900' : ''}
                     `}
                     style={{
                        backgroundColor: isActive 
                            ? `rgba(22, 78, 99, ${velocityOpacity})` // cyan-900 base
                            : undefined,
                        boxShadow: isActive 
                            ? `inset 0 0 20px rgba(6,182,212,${velocityOpacity * 0.3})`
                            : undefined
                     }}
                   >
                     {/* Step Number */}
                     <div className={`text-[10px] font-mono self-start ${isActive || isSelected ? 'text-cyan-500' : 'text-slate-600'}`}>
                         {idx + 1}
                     </div>
                     
                     {/* Note Name */}
                     {isActive && (
                        <div className="text-lg font-bold text-cyan-400" style={{ opacity: velocityOpacity }}>
                            {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][step.note % 12]}
                        </div>
                     )}

                     {/* Visual Indicators */}
                     <div className="w-full flex gap-1 h-1 mt-auto">
                        {isActive && <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${step.gate}%`, opacity: velocityOpacity }} />}
                        {isActive && step.microTiming !== 0 && (
                            <div className={`w-1 h-full rounded-full ${step.microTiming > 0 ? 'bg-yellow-500' : 'bg-pink-500'} opacity-70`} />
                        )}
                     </div>
                     
                     {isSelected && (
                         <div className="absolute top-1 right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                     )}
                   </button>
                 );
               })}
             </div>
         </div>

         {/* BOTTOM: COMMITMENT PANEL */}
         <div className="shrink-0 h-[220px] bg-slate-900 rounded-xl border border-slate-800 p-4 flex gap-6 overflow-x-auto">
             
             {/* Scale Controls */}
             <div className="flex flex-col gap-2 min-w-[120px]">
                 <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                    <Layers size={10} /> Scale & Key
                 </label>
                 <div className="bg-slate-950 p-2 rounded border border-slate-700 flex flex-col gap-2 h-full">
                     <select 
                        value={state.rootNote}
                        onChange={(e) => setState(s => ({...s, rootNote: parseInt(e.target.value)}))}
                        className="bg-slate-800 text-xs p-1 rounded border border-slate-700 focus:outline-none focus:border-cyan-500"
                     >
                        {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].map((n, i) => (
                            <option key={n} value={i}>{n}</option>
                        ))}
                     </select>
                     <select 
                        value={state.scaleType}
                        onChange={(e) => setState(s => ({...s, scaleType: e.target.value as ScaleType}))}
                        className="bg-slate-800 text-xs p-1 rounded border border-slate-700 focus:outline-none focus:border-cyan-500"
                     >
                        {Object.values(ScaleType).map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                     </select>
                     <label className="flex items-center gap-2 mt-auto cursor-pointer group">
                        <div className={`w-3 h-3 border border-slate-600 rounded-sm flex items-center justify-center ${state.scaleFold ? 'bg-cyan-500 border-cyan-500' : 'bg-slate-900'}`}>
                            {state.scaleFold && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                        </div>
                        <span className={`text-[10px] font-bold uppercase ${state.scaleFold ? 'text-cyan-400' : 'text-slate-500'} group-hover:text-slate-300`}>Fold Keys</span>
                        <input type="checkbox" className="hidden" checked={state.scaleFold} onChange={(e) => setState(s => ({...s, scaleFold: e.target.checked}))} />
                     </label>
                 </div>
             </div>

             {/* Piano */}
             <div className="flex-1 flex flex-col gap-2 min-w-[300px]">
                <div className="flex justify-between items-end">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Note Input</label>
                    {selectedStep && (
                        <span className="text-xs font-mono text-cyan-400">
                             {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][selectedStep.note % 12]}{Math.floor(selectedStep.note/12)-1}
                        </span>
                    )}
                </div>
                <div className="flex-1">
                    <PianoKeyboard 
                        currentNote={selectedStep ? selectedStep.note : -1}
                        onNoteSelect={(n) => updateSelectedStep({ note: n })}
                        rootNote={state.rootNote}
                        scaleType={state.scaleType}
                        scaleFold={state.scaleFold}
                    />
                </div>
             </div>

             {/* Parameters */}
             <div className="flex flex-col gap-2 min-w-[340px]">
                 <label className="text-[10px] font-bold uppercase text-slate-500">Step Parameters {selectedStepIdx === null && "(Select Step)"}</label>
                 <div className={`bg-slate-950 rounded border border-slate-700 h-full flex items-center justify-around px-2 ${selectedStepIdx === null ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                    <Knob 
                        label="Velocity" 
                        value={selectedStep?.velocity ?? 100} 
                        min={0} max={127} 
                        onChange={(v) => updateSelectedStep({ velocity: v })} 
                        color="text-green-400"
                    />
                    <Knob 
                        label="Gate %" 
                        value={selectedStep?.gate ?? 50} 
                        min={1} max={100} 
                        onChange={(v) => updateSelectedStep({ gate: v })} 
                        color="text-cyan-400"
                    />
                    <Knob 
                        label="MicroTime" 
                        value={selectedStep?.microTiming ?? 0} 
                        min={-50} max={50} 
                        onChange={(v) => updateSelectedStep({ microTiming: v })} 
                        color="text-yellow-400"
                    />
                    <div className="w-px h-12 bg-slate-800 mx-2"></div>
                    <Knob 
                        label="Macro A" 
                        value={selectedStep?.macroA ?? 64} 
                        min={0} max={127} 
                        onChange={(v) => updateSelectedStep({ macroA: v })} 
                        color="text-fuchsia-400"
                    />
                    <Knob 
                        label="Macro B" 
                        value={selectedStep?.macroB ?? 64} 
                        min={0} max={127} 
                        onChange={(v) => updateSelectedStep({ macroB: v })} 
                        color="text-purple-400"
                    />
                 </div>
             </div>

         </div>

      </div>
    </div>
  );
}
