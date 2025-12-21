
import React from 'react';
import { StepData, EditMode } from '../types';

interface PadProps {
  label: string;
  mainValue: string | number;
  isActive?: boolean;
  isCurrent?: boolean;
  isSelected?: boolean;
  isLocked?: boolean;
  barWidth?: number; // 0-100
  semanticColor?: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

const Pad: React.FC<PadProps> = ({
  label,
  mainValue,
  isActive,
  isCurrent,
  isSelected,
  isLocked,
  barWidth,
  semanticColor,
  onClick,
  onContextMenu,
  disabled
}) => {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        relative flex flex-col justify-between p-1.5 transition-none overflow-hidden h-full w-full
        ${isSelected ? 'z-20' : isActive ? 'bg-[var(--panel2)]' : 'bg-[var(--cell)]'}
        ${isCurrent && !isSelected ? 'bg-[var(--play)]' : ''}
        ${disabled ? 'opacity-40 grayscale cursor-not-allowed' : 'hover:bg-[var(--cellHover)]'}
      `}
      style={isSelected ? { 
        border: `1px solid ${semanticColor || 'var(--accent)'}`,
        backgroundColor: 'var(--panel2)',
        boxShadow: isCurrent ? `inset 0 0 12px ${semanticColor || 'var(--accent)'}44` : 'none'
      } : {
        border: isLocked ? `1px solid ${semanticColor}88` : '1px solid transparent'
      }}
    >
      {/* HEADER: Label + Status */}
      <div className="flex justify-between items-start w-full relative z-10">
        <span className={`text-[7px] font-bold tracking-widest ${isSelected ? 'text-[var(--text)]' : 'sg-dim'}`}>
          {label}
        </span>
        {isLocked && (
          <div className="px-1 bg-[var(--text)] text-[var(--bg)] text-[6px] font-bold leading-none py-0.5">
            LOCK
          </div>
        )}
        {isActive && !isLocked && (
          <div className={`w-1.5 h-1.5 ${isSelected ? '' : 'bg-[var(--text)] opacity-30'}`} 
               style={isSelected ? { backgroundColor: semanticColor } : {}} />
        )}
      </div>

      {/* CENTER: Main Value */}
      <div className="flex flex-col items-center justify-center relative z-10 flex-1 min-h-0">
        <span className={`text-[16px] font-bold leading-none tracking-tighter ${isSelected ? 'text-[var(--text)]' : isActive ? 'text-[var(--text)]' : 'sg-disabled'}`}
              style={isSelected && semanticColor ? { color: semanticColor } : {}}>
          {mainValue}
        </span>
      </div>

      {/* FOOTER: Bar / Meter */}
      <div className={`w-full h-[2px] relative z-10 bg-[var(--bg)] opacity-40 shrink-0`}>
        {barWidth !== undefined && barWidth > 0 && (
          <div className={`absolute top-0 left-0 h-full`} 
               style={{ 
                 width: `${barWidth}%`, 
                 backgroundColor: isSelected ? (semanticColor || 'var(--accent)') : 'var(--line2)' 
               }} />
        )}
      </div>
    </button>
  );
};

interface PadGridProps {
  pads: PadProps[];
}

const PadGrid: React.FC<PadGridProps> = ({ pads }) => {
  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      {/* 
          HARD UI CONTRACT: 
          For 8 columns and 2 rows, a 4:1 aspect ratio ensures pads are perfect squares.
          max-w-full and max-h-full ensure the grid stays within parent bounds while maintaining ratio.
      */}
      <div className="grid grid-cols-8 grid-rows-2 p-[1px] gap-[1px] bg-[var(--line)] shadow-[0_0_30px_rgba(0,0,0,0.5)] aspect-[4/1] max-w-full max-h-full w-full h-auto">
        {pads.map((p, i) => (
          <Pad key={i} {...p} />
        ))}
      </div>
    </div>
  );
};

export default PadGrid;
