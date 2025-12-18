import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Settings, RefreshCw, Layers, Download } from 'lucide-react';
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

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
const STORAGE_KEY = 'stepgrid16:v1';

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function saveToDisk(payload: any) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
}

export default function App() {
  const [patterns, setPatterns] = useState<Pattern[]>(INITIAL_PATTERNS);
  const [state, setState] = useState<SequencerState>({
    tempo: DEFAULT_TEMPO,
    isPlaying: false,
    currentStep: -1,
    activePatternIdx: 0,
    midiChannel: 1,
    midiOutputId: null,
    rootNote: 0, 
    scaleType: ScaleType.MINOR,
    scaleFold: false,
    chain: [],
    chainStep: 0,
    chainLoop: false,
  });
  
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [midiOutputs, setMidiOutputs] = useState<{id: string, name: string}[]>([]);

  const stateRef = useRef(state);
  const patternsRef = useRef(patterns);
  const patternClipboardRef = useRef<Pattern | null>(null);
  
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { patternsRef.current = patterns; }, [patterns]);

  useEffect(() => {
    midiService.initialize().then(() => {
      setMidiOutputs(midiService.getOutputs());
    });
  }, []);

  const panic = useCallback((outputId?: string | null) => {
    const out = outputId !== undefined ? outputId : stateRef.current.midiOutputId;
    const ch = stateRef.current.midiChannel;
    midiService.sendCC(out, ch, 120, 0);
    midiService.sendCC(out, ch, 121, 0);
    midiService.sendCC(out, ch, 123, 0);
  }, []);

  useEffect(() => {
    const data = safeParse<{ patterns?: Pattern[]; state?: Partial<SequencerState> }>(
      localStorage.getItem(STORAGE_KEY)
    );
    if (!data) return;
    if (data.patterns) setPatterns(data.patterns);
    if (data.state) {
      setState(s => ({ ...s, ...data.state, isPlaying: false, currentStep: -1, chainStep: 0 }));
    }
  }, []);

  useEffect(() => {
    saveToDisk({
      patterns,
      state: {
        tempo: state.tempo,
        activePatternIdx: state.activePatternIdx,
        midiChannel: state.midiChannel,
        midiOutputId: state.midiOutputId,
        rootNote: state.rootNote,
        scaleType: state.scaleType,
        scaleFold: state.scaleFold,
        chain: state.chain,
        chainLoop: state.chainLoop,
      },
    });
  }, [patterns, state]);

  useEffect(() => {
    const onBlur = () => panic();
    const onVis = () => { if (document.hidden) panic(); };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [panic]);

  const clearPattern = (idx: number) => {
    setPatterns(ps => {
      const next = [...ps];
      const p = next[idx];
      next[idx] = { ...p, steps: p.steps.map(s => ({ ...s, active: false })) };
      return next;
    });
    setSelectedStepIdx(null);
  };

  const copyPattern = (idx: number) => {
    patternClipboardRef.current = structuredClone(patternsRef.current[idx]);
  };

  const pastePattern = (idx: number) => {
    const clip = patternClipboardRef.current;
    if (!clip) return;
    setPatterns(ps => {
      const next = [...ps];
      next[idx] = structuredClone(clip);
      return next;
    });
  };

  const duplicateToNext = (idx: number) => {
    const nextIdx = (idx + 1) % 8;
    setPatterns(ps => {
      const next = [...ps];
      next[nextIdx] = structuredClone(ps[idx]);
      return next;
    });
  };

  const nextNoteTime = useRef<number>(0.0);
  const currentStepRef = useRef<number>(0);
  const timerID = useRef<number | null>(null);
  const lookahead = 25.0; 
  const scheduleAheadTime = 0.1;

  const nextNote = useCallback(() => {
    const secondsPerBeat = 60.0 / stateRef.current.tempo;
    const sixteenthNoteTime = secondsPerBeat / 4; 
    nextNoteTime.current += sixteenthNoteTime;
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
       const secondsPerBeat = 60.0 / stateRef.current.tempo;
       const sixteenth = secondsPerBeat / 4;
       const offset = step.microTiming / 1000; 
       const playTime = time + offset;
       const duration = (step.gate / 100) * sixteenth;

       midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 20, step.macroA);
       midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, 21, step.macroB);

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

  const togglePlay = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!state.isPlaying) {
        currentStepRef.current = 0;
        stateRef.current.chainStep = 0;
        nextNoteTime.current = audioCtx.currentTime;
        setState(s => ({ ...s, isPlaying: true }));
        scheduler();
    } else {
        panic();
        setState(s => ({ ...s, isPlaying: false, currentStep: -1 }));
        if (timerID.current) window.clearTimeout(timerID.current);
    }
  };

  const handleStepClick = (index: number) => {
      const pattern = patterns[state.activePatternIdx];
      const newSteps = [...pattern.steps];
      const isActive = newSteps[index].active;
      newSteps[index] = { ...newSteps[index], active: !isActive };
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
      newSteps[selectedStepIdx] = { ...newSteps[selectedStepIdx], ...updates };
      const newPatterns = [...patterns];
      newPatterns[state.activePatternIdx] = { ...pattern, steps: newSteps };
      setPatterns(newPatterns);
  };

  const handlePatternClick = (idx: number, isShift: boolean) => {
      if (isShift) {
          setState(s => ({...s, chain: [...s.chain, idx]}));
      } else {
          setState(s => ({...s, activePatternIdx: idx, chain: [], chainStep: 0, chainLoop: false}));
      }
  };

  const clearChain = () => {
      setState(s => ({...s, chain: [], chainStep: 0, chainLoop: false}));
  };

  const currentPattern = patterns[state.activePatternIdx];
  const selectedStep = selectedStepIdx !== null ? currentPattern.steps[selectedStepIdx] : null;

  return (
    <div className="h-screen flex flex-col font-mono text-[11px] overflow-hidden select-none">
      
      {/* SYSTEM BAR */}
      <header className="h-10 sg-panel border-x-0 border-t-0 flex items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--text)] tracking-tighter">STEPGRID<span className="text-[var(--accent)]">16</span></span>
            <span className="sg-dim font-bold tracking-widest text-[9px]">_V1.0_STABLE</span>
          </div>

          <div className="flex items-center gap-1">
            <button 
                onClick={togglePlay}
                className={`h-6 px-3 border transition-none font-bold tracking-widest
                    ${state.isPlaying ? 'bg-[var(--text)] text-[var(--bg)] border-[var(--text)]' : 'bg-[var(--panel2)] text-[var(--accent)] border-[var(--line)] hover:bg-[var(--play)]'}`}
            >
                {state.isPlaying ? <Square size={10} fill="currentColor"/> : <Play size={10} fill="currentColor" />}
                <span className="ml-2">{state.isPlaying ? 'STOP_SIGNAL' : 'START_SIGNAL'}</span>
            </button>
            <div className="h-6 flex items-center border border-[var(--line)] bg-[var(--bg)] px-2 gap-2">
              <span className="sg-label text-[9px]">TEMPO:</span>
              <input 
                type="number" 
                value={state.tempo}
                onChange={(e) => setState(s => ({...s, tempo: parseInt(e.target.value) || 120}))}
                className="w-8 bg-transparent text-[var(--accent)] text-right focus:outline-none sg-value"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 sg-dim">
            <Settings size={12} />
            <select 
              className="bg-transparent focus:outline-none appearance-none cursor-pointer hover:text-[var(--text)] font-bold"
              value={state.midiOutputId || ''}
              onChange={(e) => {
                const nextId = e.target.value || null;
                setState(s => ({ ...s, midiOutputId: nextId }));
              }}
            >
              <option value="">DEVICE_NULL</option>
              {midiOutputs.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <button 
              onClick={() => downloadMidi(patterns, state.chain, state.activePatternIdx, state.tempo)}
              className="h-6 px-3 border border-[var(--line)] hover:bg-[var(--panel2)] flex items-center gap-2 sg-label"
          >
              <Download size={12} />
              <span>EXPORT</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
         
         {/* REGISTERS */}
         <div className="h-16 flex gap-4">
             <div className="flex-1 sg-panel p-2 flex flex-col justify-between">
                 <div className="flex justify-between items-center sg-label mb-1">
                    <span>PATTERN_REGISTERS</span>
                    <div className="flex gap-2">
                        <button onClick={() => clearPattern(state.activePatternIdx)} className="hover:text-[var(--text)]">CLR</button>
                        <button onClick={() => copyPattern(state.activePatternIdx)} className="hover:text-[var(--text)]">CPY</button>
                        <button onClick={() => pastePattern(state.activePatternIdx)} className="hover:text-[var(--text)]">PST</button>
                        <button onClick={() => duplicateToNext(state.activePatternIdx)} className="hover:text-[var(--text)]">DUP</button>
                    </div>
                 </div>
                 <div className="flex gap-1 h-6">
                    {Array.from({length: 8}).map((_, i) => {
                        const isActive = state.activePatternIdx === i;
                        const isInChain = state.chain.includes(i);
                        return (
                          <button 
                            key={i}
                            onClick={(e) => handlePatternClick(i, e.shiftKey)}
                            className={`flex-1 border text-[10px] font-bold transition-none
                                ${isActive 
                                    ? 'bg-[var(--text)] text-[var(--bg)] border-[var(--text)]' 
                                    : 'bg-[var(--cell)] sg-dim border-[var(--line)]'}
                                ${isInChain && !isActive ? 'border-b-[var(--accent)]' : ''}
                            `}
                          >
                            P_{String(i + 1).padStart(2, '0')}
                          </button>
                        );
                    })}
                 </div>
             </div>

             <div className="w-64 sg-panel p-2 flex flex-col justify-between">
                <div className="flex justify-between items-center sg-label">
                    <span>CHAIN_SEQUENCE</span>
                    <button onClick={clearChain} className="hover:text-[var(--text)]"><RefreshCw size={8} /></button>
                </div>
                <div className="flex items-center gap-1.5 h-6 overflow-hidden border-t border-[var(--line)] mt-1 pt-1">
                    {state.chain.length > 0 ? (
                        <>
                            <div className="flex-1 overflow-x-auto scrollbar-hide flex gap-1 items-center">
                                {state.chain.map((idx, i) => (
                                    <span key={i} className={`px-1 bg-[var(--bg)] border border-[var(--line)] font-bold sg-value ${state.chainStep === i && state.isPlaying ? 'text-[var(--accent)] border-[var(--accent)]' : 'sg-dim'}`}>
                                        {idx + 1}
                                    </span>
                                ))}
                            </div>
                            <button
                              onClick={() => setState(s => ({ ...s, chainLoop: !s.chainLoop }))}
                              className={`h-full px-2 border text-[9px] font-bold ${state.chainLoop ? 'bg-[var(--text)] text-[var(--bg)] border-[var(--text)]' : 'bg-transparent sg-dim border-[var(--line)]'}`}
                            >
                              LOOP
                            </button>
                        </>
                    ) : (
                        <span className="sg-disabled italic font-bold tracking-tight">NULL_BUFFER</span>
                    )}
                </div>
             </div>
         </div>

         {/* EXECUTION GRID */}
         <div className="flex-1 bg-[var(--bg)] border border-[var(--line)] relative flex flex-col">
             <div className="grid grid-cols-8 grid-rows-2 h-full p-[1px] gap-[1px] bg-[var(--line)]">
               {currentPattern.steps.map((step, idx) => {
                 const isCurrent = state.currentStep === idx;
                 const isSelected = selectedStepIdx === idx;
                 const isActive = step.active;
                 
                 return (
                   <button
                     key={step.id}
                     onClick={() => handleStepClick(idx)}
                     onContextMenu={(e) => handleStepRightClick(e, idx)}
                     className={`
                        relative flex flex-col justify-between p-2 transition-none
                        ${isSelected ? 'sg-selected z-20' : isActive ? 'bg-[var(--panel)]' : 'bg-[var(--cell)]'}
                        ${isCurrent && !isSelected ? 'outline outline-1 outline-[var(--text)] bg-[var(--play)] z-10' : ''}
                        hover:bg-[var(--cellHover)]
                     `}
                   >
                     {/* CALIBRATION MARKS (CROSSHAIRS) */}
                     <div className={`absolute top-1/2 left-0 w-full h-[1px] ${isSelected ? 'bg-black/10' : 'bg-[var(--line)]/20'} pointer-events-none`} />
                     <div className={`absolute top-0 left-1/2 w-[1px] h-full ${isSelected ? 'bg-black/10' : 'bg-[var(--line)]/20'} pointer-events-none`} />

                     <div className="flex justify-between items-start w-full relative z-10">
                        <span className={`text-[9px] font-bold ${isSelected ? 'text-[var(--bg)]' : isActive ? 'text-[var(--accent)]' : 'sg-disabled'}`}>
                            [{String(idx + 1).padStart(2, '0')}]
                        </span>
                        {isActive && <div className={`w-3 h-3 ${isSelected ? 'bg-[var(--bg)]' : 'bg-[var(--accent)]'}`} />}
                     </div>

                     <div className="flex flex-col items-center relative z-10">
                        {isActive ? (
                            <span className={`text-[24px] font-bold leading-none tracking-tighter sg-value ${isSelected ? 'text-[var(--bg)]' : 'text-[var(--text)]'}`}>
                                {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][step.note % 12]}
                            </span>
                        ) : (
                            <div className="w-8 h-[1px] bg-[var(--line)]" />
                        )}
                        {isActive && <span className={`text-[8px] mt-1 font-bold ${isSelected ? 'opacity-40 text-[var(--bg)]' : 'sg-dim'}`}>AMP_{step.velocity}</span>}
                     </div>

                     <div className={`w-full h-[6px] mt-1 relative z-10 ${isSelected ? 'bg-black/10' : 'bg-[var(--bg)]'}`}>
                        {isActive && <div className={`absolute top-0 left-0 h-full ${isSelected ? 'bg-black' : 'bg-[var(--accent)]'}`} style={{ width: `${step.gate}%` }} />}
                     </div>
                   </button>
                 );
               })}
             </div>
         </div>

         {/* CONSOLE */}
         <div className="h-[180px] flex gap-4">
             
             {/* SCALE - REDUCED AUTHORITY */}
             <div className="w-44 sg-panel p-3 flex flex-col gap-3">
                 <span className="sg-label text-[9px]">SCALE_CONFIG</span>
                 <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between">
                        <span className="text-[8px] sg-dim">ROOT</span>
                        <select 
                            value={state.rootNote}
                            onChange={(e) => setState(s => ({...s, rootNote: parseInt(e.target.value)}))}
                            className="bg-[var(--bg)] text-[9px] px-1 border border-[var(--line)] outline-none text-[var(--dim)] w-14 text-center font-bold appearance-none cursor-pointer"
                        >
                            {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].map((n, i) => (
                                <option key={n} value={i}>{n}</option>
                            ))}
                        </select>
                     </div>
                     <div className="flex flex-col gap-1">
                        <span className="text-[8px] sg-dim">INTERVALS</span>
                        <select 
                            value={state.scaleType}
                            onChange={(e) => setState(s => ({...s, scaleType: e.target.value as ScaleType}))}
                            className="bg-[var(--bg)] text-[9px] p-1 border border-[var(--line)] outline-none text-[var(--dim)] font-bold cursor-pointer"
                        >
                            {Object.values(ScaleType).map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                     </div>
                     <button 
                        onClick={() => setState(s => ({...s, scaleFold: !s.scaleFold}))}
                        className={`mt-1 h-6 border text-[9px] font-bold transition-none ${state.scaleFold ? 'bg-[var(--panel2)] text-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--bg)] sg-disabled border-[var(--line)]'}`}
                     >
                        FOLD: {state.scaleFold ? 'ON' : 'OFF'}
                     </button>
                 </div>
             </div>

             {/* TERMINAL - ENTRY ONLY */}
             <div className="flex-1 sg-panel p-3 flex flex-col gap-2">
                <div className="flex justify-between items-center sg-label">
                    <span>ENTRY_TERMINAL</span>
                    {selectedStep && (
                        <div className="flex gap-4 items-center">
                            <span className="text-[var(--accent)] font-bold opacity-50">0x{selectedStep.note.toString(16).toUpperCase()}</span>
                            <span className="text-[var(--text)] font-bold sg-value">{["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][selectedStep.note % 12]}{Math.floor(selectedStep.note/12)-1}</span>
                        </div>
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

             {/* CALIBRATION - DOMINANT PANEL */}
             <div className="w-[480px] sg-panel p-3 flex flex-col gap-2 relative">
                 <span className="sg-label">TOLERANCE_CALIBRATION</span>
                 <div className={`flex-1 grid grid-cols-3 gap-2 ${selectedStepIdx === null ? 'opacity-5 pointer-events-none' : ''}`}>
                    <Knob label="VELOCITY" value={selectedStep?.velocity ?? 100} min={0} max={127} onChange={(v) => updateSelectedStep({ velocity: v })} />
                    <Knob label="GATE_LEN" value={selectedStep?.gate ?? 50} min={1} max={100} onChange={(v) => updateSelectedStep({ gate: v })} />
                    <Knob label="OFS_MS" value={selectedStep?.microTiming ?? 0} min={-50} max={50} onChange={(v) => updateSelectedStep({ microTiming: v })} />
                    <Knob label="MOD_01" value={selectedStep?.macroA ?? 64} min={0} max={127} onChange={(v) => updateSelectedStep({ macroA: v })} />
                    <Knob label="MOD_02" value={selectedStep?.macroB ?? 64} min={0} max={127} onChange={(v) => updateSelectedStep({ macroB: v })} />
                    <div className="flex flex-col items-center justify-center border border-[var(--line)] bg-[var(--bg)] p-1">
                        <span className="text-[7px] sg-disabled font-bold tracking-[0.5em] leading-none mb-1">REGISTER</span>
                        <div className="w-6 h-[1px] bg-[var(--line)]/20" />
                        <span className="text-[7px] sg-disabled font-bold tracking-[0.5em] leading-none mt-1">LOCKED</span>
                    </div>
                 </div>
                 {selectedStepIdx === null && (
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <span className="sg-disabled font-bold text-[16px] tracking-[2.5em]">BUFFER_IDLE</span>
                     </div>
                 )}
             </div>

         </div>

      </div>
    </div>
  );
}
