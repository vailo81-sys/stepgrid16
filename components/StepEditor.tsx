import React from 'react';
import { StepData } from '../types';
import PianoKeyboard from './PianoKeyboard';
import Knob from './Knob';
import { X } from 'lucide-react';

interface StepEditorProps {
  step: StepData;
  stepIndex: number;
  onClose: () => void;
  onUpdate: (updates: Partial<StepData>) => void;
}

const StepEditor: React.FC<StepEditorProps> = ({ step, stepIndex, onClose, onUpdate }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-xl w-full max-w-2xl p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="bg-cyan-600 text-xs px-2 py-1 rounded">STEP {stepIndex + 1}</span>
          <span>Parameter Locks</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Note Selection */}
          <div className="flex flex-col gap-4">
            <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Note Assignment</label>
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center mb-4">
                <span className="text-2xl font-mono text-cyan-400">
                  {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][step.note % 12]}
                  {Math.floor(step.note/12) - 1}
                </span>
                <span className="text-xs text-slate-500">MIDI: {step.note}</span>
              </div>
              <PianoKeyboard 
                currentNote={step.note} 
                onNoteSelect={(n) => onUpdate({ note: n })} 
              />
            </div>
          </div>

          {/* Parameters */}
          <div className="flex flex-col gap-4">
             <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Parameters</label>
             <div className="grid grid-cols-2 gap-6 p-4 bg-slate-950 rounded-lg border border-slate-800">
               <Knob 
                 label="Velocity" 
                 value={step.velocity} 
                 min={0} 
                 max={127} 
                 onChange={(v) => onUpdate({ velocity: v })} 
                 color="text-green-400"
               />
               <Knob 
                 label="Gate %" 
                 value={step.gate} 
                 min={1} 
                 max={100} 
                 onChange={(v) => onUpdate({ gate: v })} 
                 color="text-yellow-400"
               />
               <Knob 
                 label="Macro A (CC20)" 
                 value={step.macroA} 
                 min={0} 
                 max={127} 
                 onChange={(v) => onUpdate({ macroA: v })} 
                 color="text-magenta-400"
               />
               <Knob 
                 label="Macro B (CC21)" 
                 value={step.macroB} 
                 min={0} 
                 max={127} 
                 onChange={(v) => onUpdate({ macroB: v })} 
                 color="text-purple-400"
               />
             </div>
          </div>

        </div>
        
        <div className="mt-6 text-center text-xs text-slate-500">
          Tip: Parameters are locked to this step only.
        </div>
      </div>
    </div>
  );
};

export default StepEditor;