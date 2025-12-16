import React, { useState, useEffect, useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  color?: string;
}

const Knob: React.FC<KnobProps> = ({ label, value, min, max, onChange, color = 'text-cyan-400' }) => {
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
      // Sensitivity: 200px for full range
      const change = (dy / 200) * range;
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

  // Calculate rotation
  // 0% = -135deg, 100% = 135deg
  const percent = (value - min) / (max - min);
  const degrees = -135 + (percent * 270);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div 
        className="relative w-12 h-12 rounded-full border-2 border-slate-600 bg-slate-800 cursor-ns-resize flex items-center justify-center group hover:border-slate-400 transition-colors"
        onMouseDown={handleMouseDown}
      >
        <div 
          className="w-1 h-4 bg-white rounded-full absolute top-1 origin-bottom transform transition-transform duration-75 ease-out will-change-transform"
          style={{ transform: `rotate(${degrees}deg) translateY(50%)` }}
        />
        {/* Center dot/indicator */}
         <div className={`w-2 h-2 rounded-full ${isDragging ? 'bg-white' : 'bg-slate-500'}`}></div>
      </div>
      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{label}</div>
      <div className={`text-xs font-mono ${color}`}>{value}</div>
    </div>
  );
};

export default Knob;