
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Download, Play, Square, Settings2, ChevronDown } from 'lucide-react';
import { 
  Pattern, StepData, ScaleType, SCALES, EditMode 
} from './types';
import { 
  DEFAULT_TEMPO, INITIAL_PATTERNS, VELOCITY_PRESETS, GATE_PRESETS, OFFSET_PRESETS, MACRO_PRESETS 
} from './constants';
import { midiService } from './services/midiService';
import { downloadMidi } from './services/midiExport';
import PadGrid from './components/PadGrid';

/**
 * PHASE 1.7.3: [STABLE RELEASE - GATE SUSTAIN AUTHORITY]
 * BUILD_HASH: 7f2a27
 * 
 * CORE UPDATES:
 * - Gate 16 sustains perfectly across wrap boundaries.
 * - Absolute authority logging for all MIDI/Audio events.
 * - Monophonic overlap policy hardened.
 */

const BASE_OCTAVE = 3; // C3 (MIDI 48)

let audioCtx: AudioContext | null = null;

export default function App() {
  const [patterns, setPatterns] = useState<Pattern[]>(INITIAL_PATTERNS);
  const [state, setState] = useState({
    tempo: DEFAULT_TEMPO,
    isPlaying: false,
    currentStep: -1,
    activePatternIdx: 0,
    midiChannel: 1,
    midiOutputId: null as string | null,
    rootNote: 0, 
    scaleType: ScaleType.MAJOR,
    scaleFold: true,
    macroCC_A: 20,
    macroCC_B: 21
  });
  
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(EditMode.NOTE);
  const [midiOutputs, setMidiOutputs] = useState<{id: string, name: string}[]>([]);
  const [octaveShift, setOctaveShift] = useState(0);
  const [lastPressedEntryPad, setLastPressedEntryPad] = useState<number | null>(null);
  
  const stateRef = useRef(state);
  const patternsRef = useRef(patterns);
  const octaveShiftRef = useRef(octaveShift);
  const nextNoteTime = useRef<number>(0.0);
  const currentStepRef = useRef<number>(0);
  const timerID = useRef<number | null>(null);
  
  // Track the single authoritative sounding voice for the sequencer lane
  const activeVoiceRef = useRef<{
    note: number,
    osc: OscillatorNode,
    amp: GainNode,
    timeoutId: any
  } | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { patternsRef.current = patterns; }, [patterns]);
  useEffect(() => { octaveShiftRef.current = octaveShift; }, [octaveShift]);

  useEffect(() => {
    console.log(`[SG16][STABLE] v1.7.3 build=7f2a27`);
  }, []);

  const resumeAudio = useCallback(() => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive'
      });
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }, []);

  const stopActiveVoice = useCallback((reason: 'gateScheduled' | 'overlapReplace' | 'transportStop' | 'panicAllNotesOff' | 'manualRelease') => {
    const active = activeVoiceRef.current;
    if (active) {
      const { note, osc, amp, timeoutId } = active;
      if (timeoutId) clearTimeout(timeoutId);
      
      const now = audioCtx?.currentTime || 0;
      console.log(`[SG16] NOTE OFF: note=${note} tOffActual=${now.toFixed(4)} reason=${reason}`);

      // Send MIDI Off immediately
      midiService.sendNoteOff(stateRef.current.midiOutputId, stateRef.current.midiChannel, note);
      
      // Fade out internal audio to prevent clicks
      if (amp && osc) {
        try {
          amp.gain.cancelScheduledValues(now);
          amp.gain.setTargetAtTime(0, now, 0.005);
          osc.stop(now + 0.05);
        } catch (e) {}
      }
      activeVoiceRef.current = null;
    }
  }, []);

  useEffect(() => {
    const syncMidiDevices = () => {
      const outputs = midiService.getOutputs();
      setMidiOutputs(outputs);
      setState(s => {
        const currentExists = outputs.some(o => o.id === s.midiOutputId);
        if (outputs.length > 0 && (!s.midiOutputId || !currentExists)) {
          return { ...s, midiOutputId: outputs[0].id };
        }
        return s;
      });
    };
    midiService.initialize().then(syncMidiDevices);
    midiService.addListener(syncMidiDevices);
    return () => {
      midiService.removeListener(syncMidiDevices);
      stopActiveVoice('panicAllNotesOff');
    };
  }, [stopActiveVoice]);

  /**
   * AUTHORITATIVE RESOLVER
   */
  const resolveNote = useCallback((padIndex0: number, shift: number, scale: ScaleType, root: number) => {
    const intervals = SCALES[scale] || SCALES[ScaleType.MAJOR];
    const row = Math.floor(padIndex0 / 8); 
    const col = padIndex0 % 8;
    
    const intervalIdx = col % intervals.length;
    const octaveOverflow = Math.floor(col / intervals.length);

    const currentOct = BASE_OCTAVE + shift + row + octaveOverflow;
    const midi = ((currentOct + 1) * 12) + root + intervals[intervalIdx];
    
    const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const name = noteNames[midi % 12];
    const octLabel = Math.floor(midi / 12) - 1;

    return {
      midi,
      name: `${name}${octLabel}`,
      octave: octLabel,
      freq: 440 * Math.pow(2, (midi - 69) / 12),
      baseMidi: ((BASE_OCTAVE + row + 1) * 12) + root + intervals[intervalIdx]
    };
  }, []);

  const playRefTone = useCallback((midiNote: number) => {
    const ctx = resumeAudio();
    if (!ctx) return null;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(0.15, now + 0.005);
    
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    
    return { osc, amp };
  }, [resumeAudio]);

  const onEntryPadPress = useCallback((padIndex0: number) => {
    resumeAudio();
    
    if (padIndex0 === 7) { 
      setOctaveShift(prev => Math.min(prev + 1, 4));
      return;
    }
    
    if (padIndex0 === 15) { 
      setOctaveShift(prev => Math.max(prev - 1, -4));
      return;
    }

    const res = resolveNote(padIndex0, octaveShiftRef.current, stateRef.current.scaleType, stateRef.current.rootNote);
    const currentSelectedIdx = selectedStepIdx;
    
    // Manual Trigger Policy
    stopActiveVoice('overlapReplace');
    const voice = playRefTone(res.midi);
    midiService.sendNoteOn(stateRef.current.midiOutputId, stateRef.current.midiChannel, res.midi, 100);
    
    const timeoutId = setTimeout(() => {
        stopActiveVoice('manualRelease');
    }, 250);

    if (voice) {
        activeVoiceRef.current = {
            note: res.midi,
            osc: voice.osc,
            amp: voice.amp,
            timeoutId
        };
    }

    setLastPressedEntryPad(padIndex0);
    if (currentSelectedIdx !== null) {
      setPatterns(prev => {
        const next = [...prev];
        const p = { ...next[stateRef.current.activePatternIdx] };
        p.steps = [...p.steps];
        p.steps[currentSelectedIdx] = { ...p.steps[currentSelectedIdx], note: res.midi, active: true };
        next[stateRef.current.activePatternIdx] = p;
        return next;
      });
    }
  }, [resolveNote, playRefTone, resumeAudio, selectedStepIdx, stopActiveVoice]);

  const scheduleNote = useCallback((stepNumber: number, time: number) => {
    // UI Update only - decoupled from gate logic
    requestAnimationFrame(() => setState(s => ({ ...s, currentStep: stepNumber })));

    const step = patternsRef.current[stateRef.current.activePatternIdx].steps[stepNumber];
    
    if (step && step.active) {
       const ctx = resumeAudio();
       const beatDuration = 60.0 / stateRef.current.tempo;
       const stepMs = (beatDuration / 4) * 1000;
       
       const playTime = time + (step.microTiming / 1000);
       const gateSteps = step.gate;
       const durationMs = gateSteps * stepMs; 
       
       const out = stateRef.current.midiOutputId;
       const ch = stateRef.current.midiChannel;
       const delay = (playTime - ctx.currentTime) * 1000;

       // DETERMINISTIC NOTE SCHEDULE LOG
       console.log(`[SG16] NOTE ON: note=${step.note} t0=${playTime.toFixed(4)} stepMs=${stepMs.toFixed(2)} gateSteps=${gateSteps} tOffScheduled=${(playTime + durationMs/1000).toFixed(4)}`);

       setTimeout(() => {
           // 1. Cut prior trigger immediately (Mono contract)
           stopActiveVoice('overlapReplace');

           // 2. Transmit CCs
           midiService.sendCC(out, ch, stateRef.current.macroCC_A, step.macroA);
           midiService.sendCC(out, ch, stateRef.current.macroCC_B, step.macroB);

           // 3. Trigger authoritative voice
           const voice = playRefTone(step.note);
           midiService.sendNoteOn(out, ch, step.note, step.velocity);

           // 4. Schedule the release for this gate length
           const timeoutId = setTimeout(() => {
               stopActiveVoice('gateScheduled');
           }, durationMs);

           if (voice) {
               activeVoiceRef.current = {
                   note: step.note,
                   osc: voice.osc,
                   amp: voice.amp,
                   timeoutId
               };
           }
       }, Math.max(0, delay));
    }
  }, [resumeAudio, playRefTone, stopActiveVoice]);

  const scheduler = useCallback(() => {
    const ctx = resumeAudio();
    // Lookahead: schedule steps that occur in the next 100ms
    while (nextNoteTime.current < ctx.currentTime + 0.1) {
        scheduleNote(currentStepRef.current, nextNoteTime.current);
        nextNoteTime.current += (60.0 / stateRef.current.tempo) / 4;
        currentStepRef.current = (currentStepRef.current + 1) % 16;
    }
    timerID.current = window.setTimeout(scheduler, 25);
  }, [scheduleNote, resumeAudio]);

  const togglePlay = () => {
    const ctx = resumeAudio();
    if (!state.isPlaying) {
        currentStepRef.current = 0;
        nextNoteTime.current = ctx.currentTime;
        setState(s => ({ ...s, isPlaying: true }));
        scheduler();
    } else {
        setState(s => ({ ...s, isPlaying: false, currentStep: -1 }));
        if (timerID.current) window.clearTimeout(timerID.current);
        
        // Authority cleanup
        stopActiveVoice('transportStop');
        midiService.sendAllNotesOff(state.midiOutputId, state.midiChannel);
    }
  };

  const updateSelectedStep = (updates: Partial<StepData>) => {
      if (selectedStepIdx === null) return;
      setPatterns(prev => {
        const next = [...prev];
        const p = { ...next[state.activePatternIdx] };
        p.steps = [...p.steps];
        p.steps[selectedStepIdx] = { ...p.steps[selectedStepIdx], ...updates };
        next[state.activePatternIdx] = p;
        return next;
      });
  };

  const executionPads = useMemo(() => patterns[state.activePatternIdx].steps.map((step, idx) => ({
    label: `ST_${String(idx + 1).padStart(2, '0')}`,
    mainValue: editMode === EditMode.NOTE 
      ? (step.active ? ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][step.note % 12] : "")
      : (editMode === EditMode.VELOCITY ? step.velocity : 
         editMode === EditMode.GATE ? `${step.gate}ST` : 
         editMode === EditMode.OFFSET ? `${step.microTiming}ms` : 
         editMode === EditMode.MACRO_A ? step.macroA : step.macroB),
    isActive: step.active,
    isCurrent: state.currentStep === idx,
    isSelected: selectedStepIdx === idx,
    barWidth: editMode === EditMode.GATE ? (step.gate / 16) * 100 : (step.velocity / 127) * 100,
    semanticColor: editMode === EditMode.NOTE ? 'var(--accent)' : 'var(--play)',
    onClick: () => { resumeAudio(); setSelectedStepIdx(idx); if (step.active) playRefTone(step.note); },
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); resumeAudio(); updateSelectedStep({ active: !step.active }); setSelectedStepIdx(idx); }
  })), [patterns, state.activePatternIdx, state.currentStep, selectedStepIdx, editMode, resumeAudio, playRefTone]);

  const entryPads = useMemo(() => {
    if (editMode === EditMode.NOTE) {
      const pads = [];
      for (let i = 0; i < 16; i++) {
        if (i === 7) { 
          pads.push({
            label: 'OCT+', mainValue: 'UP', semanticColor: 'var(--play)', isLocked: true,
            onClick: () => onEntryPadPress(i)
          });
        } else if (i === 15) { 
          pads.push({
            label: 'OCT-', mainValue: 'DOWN', semanticColor: 'var(--play)', isLocked: true,
            onClick: () => onEntryPadPress(i)
          });
        } else {
          const res = resolveNote(i, octaveShift, state.scaleType, state.rootNote);
          pads.push({
            label: `PAD_${i + 1}`, mainValue: res.name, isSelected: lastPressedEntryPad === i,
            semanticColor: 'var(--accent)', onClick: () => onEntryPadPress(i)
          });
        }
      }
      return pads;
    } else {
      const presets = 
        editMode === EditMode.VELOCITY ? VELOCITY_PRESETS : 
        editMode === EditMode.GATE ? GATE_PRESETS : 
        editMode === EditMode.OFFSET ? OFFSET_PRESETS : MACRO_PRESETS;
      const currentSelectedStep = selectedStepIdx !== null ? patterns[state.activePatternIdx].steps[selectedStepIdx] : null;
      return presets.map((val) => {
        const isCurrentVal = (editMode === EditMode.VELOCITY && currentSelectedStep?.velocity === val) || 
                          (editMode === EditMode.GATE && currentSelectedStep?.gate === val) || 
                          (editMode === EditMode.OFFSET && currentSelectedStep?.microTiming === val) ||
                          (editMode === EditMode.MACRO_A && currentSelectedStep?.macroA === val) ||
                          (editMode === EditMode.MACRO_B && currentSelectedStep?.macroB === val);
        return {
          label: isCurrentVal ? 'CURR' : 'STAMP',
          mainValue: editMode === EditMode.GATE ? `${val}ST` : val,
          isLocked: isCurrentVal,
          semanticColor: 'var(--accent)',
          onClick: () => {
            resumeAudio();
            if (editMode === EditMode.VELOCITY) updateSelectedStep({ velocity: val });
            if (editMode === EditMode.GATE) updateSelectedStep({ gate: val });
            if (editMode === EditMode.OFFSET) updateSelectedStep({ microTiming: val });
            if (editMode === EditMode.MACRO_A) updateSelectedStep({ macroA: val });
            if (editMode === EditMode.MACRO_B) updateSelectedStep({ macroB: val });
          }
        };
      });
    }
  }, [editMode, octaveShift, patterns, state.activePatternIdx, selectedStepIdx, onEntryPadPress, lastPressedEntryPad, resolveNote, resumeAudio, state.scaleType, state.rootNote, stopActiveVoice]);

  const rootOptions = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const scaleOptions = Object.values(ScaleType);

  return (
    <div className="h-screen flex flex-col font-mono text-[11px] overflow-hidden select-none bg-[var(--bg)]" onClick={resumeAudio}>
      <header className="h-10 sg-panel border-x-0 border-t-0 flex items-center justify-between px-4 z-50 shrink-0">
        <div className="flex items-center gap-6">
          <span className="font-bold text-[var(--text)] tracking-tighter text-[13px]">STEPGRID<span className="text-[var(--accent)]">16</span></span>
          <button 
            onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
            className={`h-7 px-4 border font-bold flex items-center gap-2 transition-all ${state.isPlaying ? 'bg-[var(--text)] text-[var(--bg)] border-transparent' : 'bg-[var(--panel2)] text-[var(--accent)] border-[var(--line)]'}`}
          >
             {state.isPlaying ? <Square size={12} fill="currentColor"/> : <Play size={12} fill="currentColor"/>}
             <span className="tracking-[0.2em]">{state.isPlaying ? 'STOP' : 'START'}</span>
          </button>
          <div className="h-7 flex items-center bg-[var(--bg)] px-3 gap-2 border border-[var(--line)]">
            <span className="sg-label">BPM:</span>
            <input 
              type="number" value={state.tempo} 
              onChange={e => setState(s => ({...s, tempo: parseInt(e.target.value) || 120}))} 
              className="w-10 bg-transparent text-[var(--accent)] text-right focus:outline-none sg-value text-[12px]" 
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[var(--panel2)] border border-[var(--line)] px-2 h-7">
            <Settings2 size={10} className="sg-dim" />
            <select 
              className="bg-transparent focus:outline-none cursor-pointer text-[var(--accent)] font-bold outline-none text-[10px] min-w-[80px]" 
              value={state.midiOutputId || ''} 
              onChange={e => setState(s => ({ ...s, midiOutputId: e.target.value || null }))}
            >
              {midiOutputs.length === 0 ? <option value="">--- NO DEVICES ---</option> : null}
              {midiOutputs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <button onClick={() => downloadMidi(patterns, [], state.activePatternIdx, state.tempo)} className="h-7 px-3 border border-[var(--line)] hover:bg-[var(--panel2)] flex items-center gap-2 sg-label transition-colors">
            <Download size={12}/><span>MIDI</span>
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden max-w-[960px] mx-auto w-full">
         
         {/* PATTERN SELECTOR */}
         <div className="h-10 flex gap-4 shrink-0">
            <div className="flex-1 sg-panel p-1.5 flex gap-2.5 bg-[var(--bg)]">
              {Array.from({length: 8}).map((_, i) => (
                <button 
                  key={i} 
                  onClick={() => setState(s => ({...s, activePatternIdx: i}))} 
                  className={`flex-1 border text-[10px] font-bold transition-all ${state.activePatternIdx === i ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : 'bg-[var(--cell)] sg-dim border-[var(--line)] hover:border-[var(--line2)]'}`}
                >P{i+1}</button>
              ))}
            </div>
            <div className="w-48 sg-panel p-2 flex items-center justify-center bg-[var(--bg)] text-[var(--accent)] font-bold text-[9px] border-[var(--line)] tracking-[0.3em]">
              S.16_STABLE
            </div>
         </div>

         {/* GRID CONTAINMENT ZONE */}
         <div className="flex-1 flex flex-col items-center justify-center overflow-hidden min-h-0">
            <div className="w-full flex flex-col gap-4 max-h-full overflow-hidden">
                {/* EXECUTION */}
                <div className="flex flex-col min-h-0 gap-1">
                    <div className="flex justify-between items-center px-1 shrink-0">
                        <span className="sg-label text-[9px]">EXECUTION_SURFACE (16_STEPS)</span>
                        <span className={`text-[9px] font-bold tracking-[0.2em] ${state.isPlaying ? 'text-[var(--accent)] animate-pulse' : 'sg-disabled'}`}>{state.isPlaying ? 'MIDI_ACTIVE' : 'IDLE'}</span>
                    </div>
                    <div className="min-h-0"><PadGrid pads={executionPads} /></div>
                </div>

                {/* ENTRY */}
                <div className="flex flex-col min-h-0 gap-1">
                    <div className="flex justify-between items-center px-1 shrink-0">
                        <span className="sg-label text-[9px]">ENTRY_SURFACE (INPUT_MATRIX)</span>
                        <div className="text-[10px] font-bold text-[var(--accent)] tracking-[0.2em] uppercase">OCT_{BASE_OCTAVE + octaveShift}</div>
                    </div>
                    <div className="min-h-0"><PadGrid pads={entryPads} /></div>
                </div>
            </div>
         </div>

         {/* BOTTOM CONTROLS */}
         <div className="flex flex-col gap-3 shrink-0">
            {/* PARAMETER SELECTOR STRIP */}
            <div className="sg-panel flex items-center px-4 gap-4 border-[var(--line)] bg-[var(--panel)] h-12">
                <div className="flex h-8 gap-2 p-1 bg-[var(--bg)] border border-[var(--line)]">
                    {[EditMode.NOTE, EditMode.VELOCITY, EditMode.GATE, EditMode.OFFSET, EditMode.MACRO_A, EditMode.MACRO_B].map(m => (
                        <button key={m} onClick={() => setEditMode(m)} className={`px-3 border font-bold text-[9px] tracking-widest ${editMode === m ? 'bg-[var(--accent)] text-[var(--bg)] border-transparent' : 'sg-dim border-transparent hover:border-[var(--line)]'}`}>{m.split('_').pop()}</button>
                    ))}
                </div>
                <div className="flex-1 flex items-center gap-4 justify-end">
                  <div className="flex items-center gap-4 border-l border-[var(--line)] pl-4 h-6">
                      <span className="sg-label">FOCUS:</span>
                      <span className="text-[12px] font-bold text-[var(--text)] tracking-[0.2em]">{selectedStepIdx !== null ? `ST_${selectedStepIdx+1}` : '---'}</span>
                  </div>
                </div>
            </div>

            {/* FOOTER STATS & INTERACTIVE SCALE/ROOT */}
            <div className="h-16 sg-panel p-3 flex items-center justify-between border-[var(--line)] bg-[var(--panel2)] z-10">
                <div className="flex gap-6">
                    {/* KEY ROOT SELECT */}
                    <div className="flex flex-col">
                      <span className="sg-label text-[7px] mb-1">KEY_ROOT:</span>
                      <div className="relative">
                        <select 
                          value={state.rootNote}
                          onChange={(e) => setState(s => ({...s, rootNote: parseInt(e.target.value)}))}
                          className="bg-[var(--bg)] text-[11px] border border-[var(--line)] font-bold text-[var(--accent)] pl-3 pr-6 py-1 cursor-pointer hover:border-[var(--accent)] transition-colors focus:border-[var(--accent)] outline-none"
                        >
                          {rootOptions.map((opt, idx) => <option key={opt} value={idx}>{opt}</option>)}
                        </select>
                        <ChevronDown size={8} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--accent)]" />
                      </div>
                    </div>

                    {/* SCALE SELECT */}
                    <div className="flex flex-col">
                      <span className="sg-label text-[7px] mb-1">SCALE:</span>
                      <div className="relative">
                        <select 
                          value={state.scaleType}
                          onChange={(e) => setState(s => ({...s, scaleType: e.target.value as ScaleType}))}
                          className="bg-[var(--bg)] text-[11px] border border-[var(--line)] font-bold text-[var(--text)] pl-3 pr-6 py-1 cursor-pointer hover:border-[var(--accent)] transition-colors focus:border-[var(--accent)] outline-none"
                        >
                          {scaleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <ChevronDown size={8} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text)] opacity-40" />
                      </div>
                    </div>

                    {/* CHANNEL SELECT */}
                    <div className="flex flex-col">
                      <span className="sg-label text-[7px] mb-1">MIDI_CH:</span>
                      <div className="relative">
                        <select 
                          value={state.midiChannel}
                          onChange={(e) => setState(s => ({...s, midiChannel: parseInt(e.target.value)}))}
                          className="bg-[var(--bg)] text-[11px] border border-[var(--line)] font-bold text-[var(--text)] pl-3 pr-6 py-1 cursor-pointer hover:border-[var(--accent)] transition-colors focus:border-[var(--accent)] outline-none"
                        >
                          {Array.from({length: 16}).map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
                        </select>
                        <ChevronDown size={8} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text)] opacity-40" />
                      </div>
                    </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[8px] sg-dim tracking-[0.4em]">SYSTEM_VERSION_1.7.3_STABLE</span>
                  <span className="text-[7px] sg-disabled">7F2A27_AUTHORITY_PIPELINE</span>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
}
