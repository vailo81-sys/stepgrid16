
import React from 'react';
import { Zap } from 'lucide-react';

interface PadProps {
  label: string;
  mainValue: string | number;
  isActive?: boolean;
  isCurrent?: boolean;
  isSelected?: boolean;
  isLocked?: boolean; // Used for Accent visual
  semanticColor?: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const Pad: React.FC<PadProps> = ({
  label,
  mainValue,
  isActive,
  isCurrent,
  isSelected,
  isLocked,
  semanticColor,
  onClick,
  onContextMenu
}) => {
  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      className={`
        relative flex flex-col justify-between p-1.5 transition-none overflow-hidden h-full w-full
        ${isSelected ? 'z-20 border-[var(--accent)]' : isActive ? 'bg-[var(--panel2)] border-transparent' : 'bg-[var(--cell)] border-transparent'}
        ${isCurrent && !isSelected ? 'bg-[var(--play)]' : ''}
        hover:bg-[var(--cellHover)] border
      `}
      style={isSelected ? { 
        borderColor: semanticColor || 'var(--accent)',
        backgroundColor: 'var(--panel2)',
      } : {
        borderColor: isLocked ? semanticColor : 'transparent'
      }}
    >
      <div className="flex justify-between items-start w-full relative z-10">
        <span className={`text-[7px] font-bold tracking-widest ${isSelected ? 'text-[var(--text)]' : 'sg-dim'}`}>
          {label}
        </span>
        {isLocked && <Zap size={8} className="text-[var(--warn)]" />}
        {isActive && !isLocked && !isSelected && (
          <div className="w-1 h-1 bg-[var(--text)] opacity-30" />
        )}
      </div>

      <div className="flex flex-col items-center justify-center relative z-10 flex-1 min-h-0">
        <span className={`text-[10px] font-bold leading-tight tracking-tighter text-center px-1 ${isSelected ? 'text-[var(--text)]' : isActive ? 'text-[var(--text)]' : 'sg-disabled'}`}
              style={isSelected && semanticColor ? { color: semanticColor } : {}}>
          {mainValue}
        </span>
      </div>
    </button>
  );
};

interface PadGridProps {
  pads: PadProps[];
}

const PadGrid: React.FC<PadGridProps> = ({ pads }) => {
  return (
    <div className="grid grid-cols-8 grid-rows-2 gap-[1px] bg-[var(--line)] border border-[var(--line)] aspect-[4/1] w-full shrink-0">
      {pads.map((p, i) => (
        <Pad key={i} {...p} />
      ))}
    </div>
  );
};

export default PadGrid;
