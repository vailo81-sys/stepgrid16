import React, { useState, useEffect, useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  color?: string;
}

const Knob: React.FC<KnobProps> = ({ label, value, min, max, onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef<number>(0);
  const startValue = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dy = startY.current - e.clientY;
      const range = max - min;
      const change = (dy / 300) * range; // Slower, more precise movement
      let newValue = Math.round(startValue.current + change);
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange]);

  const percent = (value - min) / (max - min);
  const degrees = -135 + (percent * 270);

  return (
    <div className="flex flex-col sg-panel2 p-2 h-full justify-between select-none relative group transition-colors hover:bg-[var(--cellHover)]">
      <div className="flex justify-between items-start h-4">
        <span className="text-[6px] sg-label">{label}</span>
        {/* MINIMAL ROTARY CALIBRATOR */}
        <div 
          className="relative w-3.5 h-3.5 border border-[var(--line)] bg-[var(--bg)] cursor-ns-resize transition-none flex items-center justify-center overflow-hidden"
          onMouseDown={handleMouseDown}
        >
          <div 
            className="w-[1px] h-2.5 bg-[var(--accent)] absolute top-0 left-[50%] -translate-x-[50%] origin-bottom transform transition-none opacity-60"
            style={{ transform: `rotate(${degrees}deg)` }}
          />
        </div>
      </div>
      
      <div className="flex items-baseline justify-end gap-1.5 overflow-hidden">
        {/* DOMINANT NUMERIC READOUT */}
        <span className={`text-[30px] font-bold leading-none tabular-nums tracking-tighter transition-colors sg-value ${isDragging ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
            {String(value).padStart(3, '0')}
        </span>
        <div className="flex flex-col leading-none border-l border-[var(--line)] pl-1.5 h-6 justify-center">
           <span className="text-[5px] sg-disabled font-bold tracking-widest">REG</span>
           <span className="text-[5px] sg-disabled font-bold tracking-widest">VAL</span>
        </div>
      </div>

      {/* DRAG STATE INDICATOR */}
      {isDragging && <div className="absolute inset-0 border border-[var(--accent)] opacity-30 pointer-events-none" />}
    </div>
  );
};

export default Knob;