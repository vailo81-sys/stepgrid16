
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Download, Play, Square, Settings2, ChevronDown, AlertCircle, Edit3, 
  Activity, Link, Repeat, Trash2, ChevronRight, Music, Disc, Zap, MoveRight, Layers, Gauge, Timer, Cpu, Copy, Eraser, List, Plus
} from 'lucide-react';
import { 
  Pattern, StepData, NoteData, ScaleType, SCALES, EditMode 
} from './types';
import { 
  DEFAULT_TEMPO, INITIAL_PATTERNS, VELOCITY_PRESETS, GATE_PRESETS, 
  OFFSET_PRESETS, MACRO_PRESETS, SWING_PRESETS, createEmptyNote, createEmptyPattern 
} from './constants';
import { midiService } from './services/midiService';
import { downloadMidi } from './services/midiExport';
import PadGrid from './components/PadGrid';

const BASE_OCTAVE = 3; 
let audioCtx: AudioContext | null = null;

const DRUM_MAP: Record<number, { name: string, midi: number }> = {
  0: { name: 'KIK', midi: 36 },
  1: { name: 'SNR', midi: 38 },
  2: { name: 'CHH', midi: 42 },
  3: { name: 'OHH', midi: 46 },
  4: { name: 'CLP', midi: 39 },
  5: { name: 'RIM', midi: 37 },
  6: { name: 'LT', midi: 41 },
  7: { name: 'MT', midi: 45 },
  8: { name: 'HT', midi: 48 },
  9: { name: 'CYM', midi: 49 },
  10: { name: 'RS', midi: 51 },
  11: { name: 'CB', midi: 56 },
  12: { name: 'MA', midi: 70 },
  13: { name: 'CL', midi: 75 },
  14: { name: 'AG', midi: 67 },
  15: { name: 'BG', midi: 68 },
};

const SUPER_GATE_PRESETS = [0.1, 0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 1, 1.5, 2, 4, 6, 8, 10, 12, 16];

export default function App() {
  const [patterns, setPatterns] = useState<Pattern[]>(INITIAL_PATTERNS);
  const [instrumentMode, setInstrumentMode] = useState<'MEL' | 'DRUM'>('MEL');
  const [superGateEnabled, setSuperGateEnabled] = useState(false);
  const [state, setState] = useState({
    tempo: DEFAULT_TEMPO,
    isPlaying: false,
    currentStep: -1,
    activePatternIdx: 0,
    midiChannel: 1,
    midiOutputId: null as string | null,
    rootNote: 0, 
    scaleType: ScaleType.MAJOR,
    macroCC_A: 20,
    macroCC_B: 21,
    stepRecord: false,
    chainEnabled: false,
    chain: [] as number[],
    chainStep: 0,
    chainLoop: true,
    attackMs: 2,
    releaseMs: 60,
  });
  
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [selectedNoteIdx, setSelectedNoteIdx] = useState<number>(0);
  const [editMode, setEditMode] = useState<EditMode>(EditMode.NOTE);
  const [midiOutputs, setMidiOutputs] = useState<{id: string, name: string}[]>([]);
  const [octaveShift, setOctaveShift] = useState(0);
  const [midiLog, setMidiLog] = useState<string[]>([]);
  const [clipboardPattern, setClipboardPattern] = useState<Pattern | null>(null);
  
  const stateRef = useRef(state);
  const patternsRef = useRef(patterns);
  const octaveShiftRef = useRef(octaveShift);
  const instrumentModeRef = useRef(instrumentMode);
  
  const nextNoteTime = useRef<number>(0.0);
  const currentStepRef = useRef<number>(0);
  const chainStepRef = useRef<number>(0);
  const timerID = useRef<number | null>(null);
  const activeVoicesRef = useRef<Map<string, { note: number, nodes: any[], timeoutId: any }>>(new Map());
  const pendingTriggersRef = useRef<Set<any>>(new Set());

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { patternsRef.current = patterns; }, [patterns]);
  useEffect(() => { octaveShiftRef.current = octaveShift; }, [octaveShift]);
  useEffect(() => { instrumentModeRef.current = instrumentMode; }, [instrumentMode]);

  const resumeAudio = useCallback(() => {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }, []);

  const logMidi = useCallback((status: number, channel: number, d1: number, d2: number) => {
    const msg = `${status.toString(16).toUpperCase()} C${channel} ${d1}:${d2}`;
    setMidiLog(prev => [msg, ...prev].slice(0, 3));
  }, []);

  const stopVoice = useCallback((voiceId: string) => {
    const voice = activeVoicesRef.current.get(voiceId);
    if (voice) {
      if (voice.timeoutId) clearTimeout(voice.timeoutId);
      midiService.sendNoteOff(stateRef.current.midiOutputId, stateRef.current.midiChannel, voice.note);
      if (voice.nodes) {
        const now = audioCtx?.currentTime || 0;
        voice.nodes.forEach(node => {
          if (node.gain) {
            node.gain.cancelScheduledValues(now);
            node.gain.setTargetAtTime(0, now, 0.015);
          }
          if (node.stop) node.stop(now + 0.1);
          if (node.disconnect) node.disconnect();
        });
      }
      activeVoicesRef.current.delete(voiceId);
    }
  }, []);

  const stopAllVoices = useCallback(() => {
    activeVoicesRef.current.forEach((_, id) => stopVoice(id));
  }, [stopVoice]);

  const getNoteName = useCallback((midi: number) => {
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const oct = Math.floor(midi / 12) - 1;
    return `${names[midi % 12]}${oct}`;
  }, []);

  const playRefTone = useCallback((midiNote: number, velocity = 100, durationMs = 300) => {
    const ctx = resumeAudio();
    const now = ctx.currentTime;
    const amp = ctx.createGain();
    const nodes: any[] = [];
    const voiceId = `v_${midiNote}_${Date.now()}`;
    const gainVal = (velocity / 127) * 0.4;

    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(gainVal, now + (stateRef.current.attackMs / 1000));
    amp.gain.exponentialRampToValueAtTime(0.001, now + (durationMs / 1000));
    amp.connect(ctx.destination);

    if (instrumentModeRef.current === 'DRUM') {
      if (midiNote === 36) { 
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
        osc.connect(amp);
        osc.start(now);
        nodes.push(osc);
      } else if ([38, 39].includes(midiNote)) { 
        const bufferSize = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 0.5;
        noise.connect(filter).connect(amp);
        noise.start(now);
        nodes.push(noise, filter);
      } else if ([42, 46].includes(midiNote)) { 
        const bufferSize = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8500;
        noise.connect(filter).connect(amp);
        noise.start(now);
        nodes.push(noise, filter);
      } else {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 350 + (midiNote * 3);
        osc.connect(amp);
        osc.start(now);
        nodes.push(osc);
      }
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440 * Math.pow(2, (midiNote - 69) / 12), now);
      osc.connect(amp);
      osc.start(now);
      nodes.push(osc);
    }
    
    const timeoutId = setTimeout(() => stopVoice(voiceId), durationMs + 100);
    activeVoicesRef.current.set(voiceId, { note: midiNote, nodes, timeoutId });
    
    midiService.sendNoteOn(stateRef.current.midiOutputId, stateRef.current.midiChannel, midiNote, velocity);
    logMidi(0x90, stateRef.current.midiChannel, midiNote, velocity);
  }, [resumeAudio, stopVoice, logMidi]);

  const scheduleNote = useCallback((stepNumber: number, time: number, patternIdx: number) => {
    requestAnimationFrame(() => setState(s => ({ ...s, currentStep: stepNumber })));
    const pattern = patternsRef.current[patternIdx];
    const step = pattern.steps[stepNumber];
    
    if (stepNumber >= pattern.length) return; 

    if (step && step.active) {
       const beatDur = 60.0 / stateRef.current.tempo;
       const sixteenthMs = (beatDur / 4) * 1000;
       step.notes.forEach(note => {
          const swingMs = (stepNumber % 2 === 1) ? (sixteenthMs * (step.swing / 100) * 0.5) : 0;
          const playTime = time + ((note.microTiming + swingMs) / 1000);
          const duration = note.gate * sixteenthMs;
          const delay = Math.max(0, (playTime - (audioCtx?.currentTime || 0)) * 1000);
          
          const trigger = setTimeout(() => {
              pendingTriggersRef.current.delete(trigger);
              midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, stateRef.current.macroCC_A, note.macroA);
              midiService.sendCC(stateRef.current.midiOutputId, stateRef.current.midiChannel, stateRef.current.macroCC_B, note.macroB);
              playRefTone(note.pitch, step.accent ? Math.min(127, note.velocity * 1.5) : note.velocity, duration);
          }, delay);
          pendingTriggersRef.current.add(trigger);
       });
    }
  }, [playRefTone, resumeAudio]);

  const togglePlay = useCallback(() => {
    resumeAudio();
    if (!stateRef.current.isPlaying) {
        currentStepRef.current = 0;
        chainStepRef.current = 0;
        nextNoteTime.current = audioCtx!.currentTime;
        
        // When starting with chain enabled, ensure we start on the first pattern in chain
        if (stateRef.current.chainEnabled && stateRef.current.chain.length > 0) {
           const initialP = stateRef.current.chain[0];
           setState(s => ({ ...s, isPlaying: true, chainStep: 0, activePatternIdx: initialP }));
        } else {
           setState(s => ({ ...s, isPlaying: true }));
        }

        const loop = () => {
          while (nextNoteTime.current < audioCtx!.currentTime + 0.1) {
              const activeS = stateRef.current;
              let pIdx = activeS.activePatternIdx;
              
              if (activeS.chainEnabled && activeS.chain.length > 0) {
                 pIdx = activeS.chain[chainStepRef.current];
              }

              const pLength = patternsRef.current[pIdx].length;
              scheduleNote(currentStepRef.current, nextNoteTime.current, pIdx);
              
              nextNoteTime.current += (60.0 / activeS.tempo) / 4;
              currentStepRef.current++;

              if (currentStepRef.current >= pLength) {
                 currentStepRef.current = 0;
                 if (activeS.chainEnabled && activeS.chain.length > 0) {
                    chainStepRef.current++;
                    if (chainStepRef.current >= activeS.chain.length) {
                       if (activeS.chainLoop) {
                          chainStepRef.current = 0;
                       } else {
                          togglePlay();
                          return;
                       }
                    }
                    const nextP = activeS.chain[chainStepRef.current];
                    requestAnimationFrame(() => setState(s => ({ ...s, activePatternIdx: nextP, chainStep: chainStepRef.current })));
                 }
              }
          }
          timerID.current = window.setTimeout(loop, 25);
        };
        loop();
    } else {
        setState(s => ({ ...s, isPlaying: false, currentStep: -1 }));
        if (timerID.current) clearTimeout(timerID.current);
        pendingTriggersRef.current.forEach(t => clearTimeout(t));
        stopAllVoices();
        midiService.sendAllNotesOff(stateRef.current.midiOutputId, stateRef.current.midiChannel);
    }
  }, [scheduleNote, stopAllVoices, resumeAudio]);

  const updateActivePattern = useCallback((updates: Partial<Pattern>) => {
    setPatterns(prev => {
      const next = [...prev];
      next[stateRef.current.activePatternIdx] = { ...next[stateRef.current.activePatternIdx], ...updates };
      return next;
    });
  }, []);

  const clearPattern = useCallback(() => {
    if (!confirm("Clear this pattern?")) return;
    updateActivePattern(createEmptyPattern(state.activePatternIdx));
  }, [state.activePatternIdx, updateActivePattern]);

  const copyPattern = useCallback(() => {
    setClipboardPattern(JSON.parse(JSON.stringify(patterns[state.activePatternIdx])));
  }, [patterns, state.activePatternIdx]);

  const pastePattern = useCallback(() => {
    if (!clipboardPattern) return;
    updateActivePattern({ ...clipboardPattern, id: state.activePatternIdx });
  }, [clipboardPattern, state.activePatternIdx, updateActivePattern]);

  const updateSelectedStep = useCallback((updates: Partial<StepData>) => {
    if (selectedStepIdx === null) return;
    setPatterns(prev => {
      const next = [...prev];
      const p = { ...next[stateRef.current.activePatternIdx] };
      p.steps = [...p.steps];
      p.steps[selectedStepIdx] = { ...p.steps[selectedStepIdx], ...updates };
      next[stateRef.current.activePatternIdx] = p;
      return next;
    });
  }, [selectedStepIdx]);

  const updateSelectedNote = (updates: Partial<NoteData>) => {
    if (selectedStepIdx === null) return;
    const step = patterns[state.activePatternIdx].steps[selectedStepIdx];
    if (step.notes.length === 0) return;
    const newNotes = [...step.notes];
    newNotes[selectedNoteIdx] = { ...newNotes[selectedNoteIdx], ...updates };
    updateSelectedStep({ notes: newNotes });
  };

  const resolveNote = useCallback((padIdx: number, shift: number, scale: ScaleType, root: number, mode: 'MEL' | 'DRUM') => {
    if (mode === 'DRUM') {
      const d = DRUM_MAP[padIdx];
      return { midi: d.midi, name: d.name };
    }
    const intervals = SCALES[scale];
    const row = Math.floor(padIdx / 8); 
    const col = padIdx % 8;
    const intervalIdx = col % intervals.length;
    const oct = BASE_OCTAVE + shift + row + Math.floor(col / intervals.length);
    const midi = ((oct + 1) * 12) + root + intervals[intervalIdx];
    return { midi, name: getNoteName(midi) };
  }, [getNoteName]);

  const getStepLabel = useCallback((midi: number, mode: 'MEL' | 'DRUM') => {
    if (mode === 'DRUM') {
      const d = Object.values(DRUM_MAP).find(x => x.midi === midi);
      if (d) return d.name;
    }
    return getNoteName(midi);
  }, [getNoteName]);

  const activePattern = patterns[state.activePatternIdx];

  const executionPads = useMemo(() => activePattern.steps.map((step, idx) => {
    let cellText = "";
    if (step.active && step.notes.length > 0) {
      cellText = step.notes.slice(0, 3).map(n => getStepLabel(n.pitch, instrumentMode)).join(" ");
      if (step.notes.length > 3) cellText += ` +${step.notes.length - 3}`;
    }
    const isOut = idx >= activePattern.length;
    return {
      label: `ST_${idx + 1}`,
      mainValue: isOut ? '---' : editMode === EditMode.SWING ? `${step.swing}%` : cellText,
      isActive: !isOut && step.active,
      isCurrent: !isOut && state.currentStep === idx,
      isSelected: !isOut && selectedStepIdx === idx,
      isLocked: !isOut && step.accent,
      semanticColor: isOut ? 'var(--disabled)' : step.accent ? 'var(--warn)' : 'var(--accent)',
      onClick: () => { if (!isOut) { setSelectedStepIdx(idx); setSelectedNoteIdx(0); } },
      onContextMenu: (e: any) => { e.preventDefault(); if (!isOut) updateSelectedStep({ active: false, notes: [] }); }
    };
  }), [activePattern, state.currentStep, selectedStepIdx, editMode, updateSelectedStep, getStepLabel, instrumentMode]);

  const entryPads = useMemo(() => {
    if (editMode === EditMode.NOTE) {
      return Array.from({length: 16}).map((_, i) => {
        if (instrumentMode === 'MEL') {
          if (i === 7) return { label: 'OCT+', mainValue: 'UP', semanticColor: 'var(--play)', isLocked: true, onClick: () => setOctaveShift(s => Math.min(s + 1, 4)) };
          if (i === 15) return { label: 'OCT-', mainValue: 'DOWN', semanticColor: 'var(--play)', isLocked: true, onClick: () => setOctaveShift(s => Math.max(s - 1, -4)) };
        }
        const res = resolveNote(i, octaveShift, state.scaleType, state.rootNote, instrumentMode);
        const currentStep = activePattern.steps[selectedStepIdx !== null ? selectedStepIdx : 0];
        const inStack = selectedStepIdx !== null && currentStep.notes.some(n => n.pitch === res.midi);
        return {
          label: instrumentMode === 'DRUM' ? `D_${i + 1}` : `P_${i + 1}`,
          mainValue: res.name,
          isActive: inStack,
          semanticColor: 'var(--accent)',
          onClick: () => {
             const stepIdx = selectedStepIdx !== null ? selectedStepIdx : 0;
             const step = activePattern.steps[stepIdx];
             const nextNotes = state.stepRecord 
               ? [createEmptyNote(res.midi)] 
               : inStack ? step.notes.filter(n => n.pitch !== res.midi) : [...step.notes, createEmptyNote(res.midi)];
             
             if (selectedStepIdx !== null) {
               updateSelectedStep({ active: nextNotes.length > 0, notes: nextNotes });
               if (state.stepRecord) setSelectedStepIdx(s => (s !== null ? (s + 1) % 16 : 0));
             }
             playRefTone(res.midi);
          },
          onContextMenu: (e: any) => { 
            e.preventDefault(); 
            playRefTone(res.midi, 110, 300); 
          }
        };
      });
    } else {
      const isGate = editMode === EditMode.GATE;
      const presets = isGate && superGateEnabled ? SUPER_GATE_PRESETS :
                     editMode === EditMode.VELOCITY ? VELOCITY_PRESETS : 
                     editMode === EditMode.GATE ? GATE_PRESETS : 
                     editMode === EditMode.OFFSET ? OFFSET_PRESETS : 
                     editMode === EditMode.SWING ? SWING_PRESETS : MACRO_PRESETS;
      return presets.map(val => ({
        label: 'VAL', mainValue: val, semanticColor: 'var(--accent)',
        onClick: () => {
          if (editMode === EditMode.SWING) updateSelectedStep({ swing: val });
          else updateSelectedNote({ [editMode.toLowerCase()]: val });
        }
      }));
    }
  }, [editMode, instrumentMode, octaveShift, state.scaleType, state.rootNote, selectedStepIdx, activePattern, updateSelectedStep, state.stepRecord, playRefTone, superGateEnabled, resolveNote]);

  const addToChain = useCallback((pIdx: number) => {
    setState(s => ({ ...s, chain: [...s.chain, pIdx] }));
  }, []);

  useEffect(() => { midiService.initialize().then(() => setMidiOutputs(midiService.getOutputs())); }, []);

  return (
    <div className="h-screen flex flex-col font-mono text-[11px] overflow-hidden select-none bg-[var(--bg)]" onContextMenu={e => e.preventDefault()}>
      <header className="h-10 sg-panel border-x-0 border-t-0 flex items-center justify-between px-4 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[var(--text)] text-[13px] tracking-tighter">STEPGRID<span className="text-[var(--accent)]">16</span></span>
          <div className="flex gap-2">
            <button onClick={togglePlay} className={`h-7 px-4 border font-bold flex items-center gap-2 transition-all ${state.isPlaying ? 'bg-[var(--text)] text-[var(--bg)] border-transparent' : 'bg-[var(--panel2)] text-[var(--accent)] border-[var(--line)]'}`}>
              {state.isPlaying ? <Square size={12} fill="currentColor"/> : <Play size={12} fill="currentColor"/>}
              <span className="tracking-widest">{state.isPlaying ? 'STOP' : 'START'}</span>
            </button>
            <button onClick={() => setState(s => ({...s, stepRecord: !s.stepRecord}))} className={`h-7 px-4 border font-bold flex items-center gap-2 transition-all ${state.stepRecord ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : 'sg-dim border-[var(--line)]'}`}>
              <Edit3 size={12}/><span>STEP_REC</span>
            </button>
          </div>
          <div className="h-7 flex items-center bg-[var(--bg)] px-3 border border-[var(--line)] ml-2 group hover:border-[var(--line2)]">
            <span className="sg-label mr-2">BPM:</span>
            <input type="number" value={state.tempo} onChange={e => setState(s => ({...s, tempo: parseInt(e.target.value) || 120}))} className="w-10 bg-transparent text-[var(--accent)] text-right focus:outline-none sg-value text-[12px] cursor-ns-resize" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[var(--panel2)] border border-[var(--line)] px-2 h-7">
            <Activity size={10} className={state.isPlaying ? 'text-[var(--accent)]' : 'sg-dim'} />
            <div className="flex items-center">
               <select className="bg-transparent focus:outline-none cursor-pointer text-[var(--accent)] font-bold outline-none text-[10px] min-w-[100px]" value={state.midiOutputId || ''} onChange={e => setState(s => ({ ...s, midiOutputId: e.target.value }))}>
                {midiOutputs.length === 0 ? <option value="">--- NO DEVICES ---</option> : null}
                {midiOutputs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="border-l border-[var(--line)] ml-2 pl-2 flex items-center gap-1.5">
                <span className="text-[8px] sg-dim">CH:</span>
                <input type="number" min="1" max="16" value={state.midiChannel} onChange={e => setState(s => ({...s, midiChannel: Math.max(1, Math.min(16, parseInt(e.target.value) || 1))}))} className="w-6 bg-transparent text-[var(--accent)] font-bold outline-none" />
              </div>
            </div>
          </div>
          <button onClick={() => downloadMidi(patterns, state.chain, state.activePatternIdx, state.tempo)} className="h-7 px-3 border border-[var(--line)] sg-label hover:bg-[var(--panel2)] transition-colors"><Download size={12}/></button>
        </div>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-4 max-w-[960px] mx-auto w-full overflow-hidden">
         <div className="flex flex-col gap-1.5 shrink-0 bg-[var(--panel)] p-1.5 border border-[var(--line)]">
            <div className="flex gap-1.5 h-8">
              {Array.from({length: 8}).map((_, i) => {
                const chainCount = state.chain.filter(x => x === i).length;
                const activeInChain = state.chainEnabled && state.chain[state.chainStep] === i && state.isPlaying;
                return (
                  <button key={i} onClick={() => setState(s => ({...s, activePatternIdx: i}))} onContextMenu={(e) => { e.preventDefault(); addToChain(i); }} className={`flex-1 border text-[10px] font-bold transition-all relative ${state.activePatternIdx === i ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : activeInChain ? 'bg-[var(--play)] text-[var(--text)] border-[var(--line2)]' : 'bg-[var(--cell)] sg-dim border-[var(--line)] hover:border-[var(--line2)]'}`}>
                    P{i+1} {chainCount > 0 && <span className="absolute top-0 right-1 text-[7px] text-[var(--accent)] opacity-80">({chainCount})</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-1 h-6">
               <div className="flex gap-4 items-center">
                 <div className="flex gap-2">
                    <button onClick={clearPattern} className="flex items-center gap-1 sg-label hover:text-[var(--neg)]"><Eraser size={10}/> CLR_P</button>
                    <button onClick={copyPattern} className="flex items-center gap-1 sg-label hover:text-[var(--accent)]"><Copy size={10}/> COPY</button>
                    <button onClick={pastePattern} disabled={!clipboardPattern} className={`flex items-center gap-1 sg-label ${clipboardPattern ? 'hover:text-[var(--accent)]' : 'opacity-20 cursor-not-allowed'}`}><List size={10}/> PASTE</button>
                    <button onClick={() => addToChain(state.activePatternIdx)} className="flex items-center gap-1 px-2 h-4 bg-[var(--accent)] text-[var(--bg)] font-bold text-[8px] hover:opacity-80 transition-opacity"><Plus size={10}/> ADD_TO_CHAIN</button>
                 </div>
                 <div className="w-[1px] h-3 bg-[var(--line)] mx-1" />
                 <div className="flex gap-2">
                    <button onClick={() => setState(s => ({...s, chainEnabled: !s.chainEnabled}))} className={`flex items-center gap-1.5 px-2 h-5 border font-bold text-[8px] transition-all ${state.chainEnabled ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : 'sg-dim border-[var(--line)] hover:border-[var(--line2)]'}`}>
                      <Link size={10}/> CHAIN_{state.chainEnabled ? 'ON' : 'OFF'}
                    </button>
                    <button onClick={() => setState(s => ({...s, chainLoop: !s.chainLoop}))} className={`flex items-center gap-1.5 px-2 h-5 border font-bold text-[8px] transition-all ${state.chainLoop ? 'bg-[var(--play)] text-[var(--text)] border-transparent' : 'sg-dim border-[var(--line)]'}`}>
                      <Repeat size={10}/> {state.chainLoop ? 'LOOP' : 'ONCE'}
                    </button>
                    <button onClick={() => setState(s => ({...s, chain: []}))} className="flex items-center gap-1 sg-label hover:text-[var(--neg)]"><Trash2 size={10}/> CLR_CHN</button>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                  <span className="sg-label">STEPS:</span>
                  <input type="number" min="1" max="16" value={activePattern.length} onChange={e => updateActivePattern({ length: Math.max(1, Math.min(16, parseInt(e.target.value) || 16)) })} className="w-8 bg-transparent text-[var(--accent)] font-bold outline-none text-right" />
               </div>
            </div>
            {state.chain.length > 0 && (
              <div className="mt-1 flex gap-1 items-center overflow-x-auto no-scrollbar border-t border-[var(--line)] pt-1">
                <span className="sg-label mr-2 shrink-0">SEQUENCE:</span>
                {state.chain.map((idx, i) => (
                   <span key={i} className={`px-1.5 py-0.5 border text-[7px] font-bold ${state.chainStep === i && state.isPlaying ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : 'bg-[var(--bg)] sg-dim border-[var(--line)]'}`}>P{idx + 1}</span>
                ))}
              </div>
            )}
         </div>

         <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="flex flex-col gap-1">
              <span className="sg-label flex justify-between">EXECUTION_SURFACE <span className="text-[7px]">R-CLICK: CLEAR STEP</span></span>
              <PadGrid pads={executionPads} />
            </div>

            <div className="flex justify-between items-center h-8 shrink-0 bg-[var(--panel)] px-2 border border-[var(--line)]">
               <div className="flex items-center gap-4">
                  <div className="flex p-0.5 bg-[var(--bg)] border border-[var(--line)] h-7">
                    <button onClick={() => setInstrumentMode('MEL')} className={`px-3 flex items-center gap-1.5 text-[9px] font-bold transition-all ${instrumentMode === 'MEL' ? 'bg-[var(--accent)] text-[var(--bg)]' : 'sg-dim hover:text-[var(--text)]'}`}><Music size={11}/>MELODIC</button>
                    <button onClick={() => setInstrumentMode('DRUM')} className={`px-3 flex items-center gap-1.5 text-[9px] font-bold transition-all ${instrumentMode === 'DRUM' ? 'bg-[var(--accent)] text-[var(--bg)]' : 'sg-dim hover:text-[var(--text)]'}`}><Disc size={11}/>DRUM_RACK</button>
                  </div>
               </div>
               <div className="flex gap-2 items-center">
                  <div className="flex gap-4 items-center bg-[var(--bg)] px-3 h-7 border border-[var(--line)]">
                    <span className="sg-label flex items-center gap-1"><Timer size={10}/> AR_ENV (MS):</span>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] sg-dim">ATT</span>
                        <input type="number" value={state.attackMs} onChange={e => setState(s => ({...s, attackMs: parseInt(e.target.value) || 0}))} className="w-8 bg-transparent text-[var(--accent)] font-bold focus:outline-none" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] sg-dim">REL</span>
                        <input type="number" value={state.releaseMs} onChange={e => setState(s => ({...s, releaseMs: parseInt(e.target.value) || 0}))} className="w-8 bg-transparent text-[var(--accent)] font-bold focus:outline-none" />
                      </div>
                    </div>
                  </div>
                  <button onClick={() => updateSelectedStep({ accent: !activePattern.steps[selectedStepIdx || 0].accent })} className={`h-7 px-4 border font-bold text-[9px] transition-all ${selectedStepIdx !== null && activePattern.steps[selectedStepIdx].accent ? 'bg-[var(--warn)] text-[var(--bg)] border-transparent' : 'sg-dim border-[var(--line)] hover:border-[var(--line2)]'}`}>ACCENT</button>
               </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="sg-label flex justify-between">ENTRY_AUTHORITY <span className="text-[7px]">R-CLICK: PREVIEW PAD</span></span>
              <PadGrid pads={entryPads} />
            </div>
         </div>

         <div className="flex flex-col gap-3 shrink-0 bg-[var(--panel2)] p-4 border border-[var(--line)]">
            <div className="flex items-center justify-between">
                <div className="flex gap-1.5 items-center">
                  <div className="flex h-8 bg-[var(--bg)] p-1 border border-[var(--line)]">
                      {[EditMode.NOTE, EditMode.VELOCITY, EditMode.GATE, EditMode.OFFSET, EditMode.SWING, EditMode.MACRO_A].map(m => (
                          <button key={m} onClick={() => setEditMode(m)} className={`px-3 border font-bold text-[9px] tracking-widest transition-all ${editMode === m ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : 'sg-dim border-transparent hover:border-[var(--line)]'}`}>{m.split('_').pop()}</button>
                      ))}
                  </div>
                  {editMode === EditMode.GATE && (
                    <button 
                      onClick={() => setSuperGateEnabled(!superGateEnabled)} 
                      className={`h-7 px-3 border flex items-center gap-2 font-bold text-[8px] transition-all ${superGateEnabled ? 'bg-[var(--warn)] text-[var(--bg)] border-transparent' : 'sg-dim border-[var(--line)]'}`}
                    >
                      <Gauge size={12}/> SUPER_RES
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="sg-label">SCALE AUTHORITY:</span>
                    <div className="flex gap-1 bg-[var(--bg)] p-1 border border-[var(--line)]">
                      <select 
                        value={state.rootNote} 
                        onChange={e => setState(s => ({...s, rootNote: parseInt(e.target.value)}))}
                        className="bg-transparent text-[var(--accent)] font-bold text-[9px] outline-none"
                      >
                        {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].map((n, i) => <option key={n} value={i}>{n}</option>)}
                      </select>
                      <select 
                        value={state.scaleType} 
                        onChange={e => setState(s => ({...s, scaleType: e.target.value as ScaleType}))}
                        className="bg-transparent text-[var(--text)] font-bold text-[9px] outline-none border-l border-[var(--line)] pl-2"
                      >
                        {Object.values(ScaleType).map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4 h-10 bg-[var(--bg)] px-4 border border-[var(--line)]">
                <div className="flex items-center gap-3 pr-4 border-r border-[var(--line)] h-full">
                  <span className="sg-label">FOCUS:</span>
                  <span className="text-[12px] font-bold text-[var(--text)] tracking-[0.2em]">ST_{selectedStepIdx !== null ? String(selectedStepIdx + 1).padStart(2, '0') : '--'}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <span className="sg-label">STACK:</span>
                  <div className="flex gap-1">
                    {selectedStepIdx !== null && activePattern.steps[selectedStepIdx].notes.map((n, i) => (
                      <button key={i} onClick={() => setSelectedNoteIdx(i)} className={`px-2 py-0.5 border text-[9px] font-bold transition-all ${selectedNoteIdx === i ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : 'bg-[var(--panel)] border-[var(--line)] sg-dim'}`}>{getStepLabel(n.pitch, instrumentMode)}</button>
                    ))}
                  </div>
                </div>
                <div className="h-full flex items-center pl-4 border-l border-[var(--line)]">
                   <div className="flex gap-4">
                      {midiLog.map((log, i) => <span key={i} className={`text-[7px] tabular-nums whitespace-nowrap ${i === 0 ? 'text-[var(--accent)]' : 'sg-disabled'}`}>{log}</span>)}
                   </div>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
}
