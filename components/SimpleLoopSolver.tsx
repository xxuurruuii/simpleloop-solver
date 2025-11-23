import React, { useState, useEffect, useCallback } from 'react';
import { Play, SkipForward, RotateCcw, Settings2, Grid3X3, Info, Link as LinkIcon, Download, Zap } from 'lucide-react';
import { initializeState, applyRules, SolverState, EdgeState, Cell } from '../services/logic';

const CELL_SIZE = 40;
const GRID_PADDING = 20;

const SimpleLoopSolver: React.FC = () => {
  // Dimensions
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [speed, setSpeed] = useState(20);

  // Core State
  const [solverState, setSolverState] = useState<SolverState | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);

  // Edit Mode state tracking (to preserve black squares when resizing)
  const [blackCells, setBlackCells] = useState<Set<string>>(new Set());
  
  // Import State
  const [importUrl, setImportUrl] = useState('');

  // Initialization
  useEffect(() => {
    // Re-init solver state whenever dimensions or black cells change IF we are not in solving mode
    if (!isSolving) {
      resetGrid(rows, cols, blackCells);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols]);

  const resetGrid = (r: number, c: number, currentBlackCells: Set<string>) => {
    const tempCells: Cell[][] = [];
    for (let i = 0; i < r; i++) {
      const row: Cell[] = [];
      for (let j = 0; j < c; j++) {
        row.push({
          r: i,
          c: j,
          isBlack: currentBlackCells.has(`${i},${j}`),
          groupId: 0 
        });
      }
      tempCells.push(row);
    }
    const newState = initializeState(r, c, tempCells);
    setSolverState(newState);
    setIsSolving(false);
    setAutoRunning(false);
  };

  const handleCellClick = (r: number, c: number) => {
    if (isSolving) return;

    const key = `${r},${c}`;
    const newBlackCells = new Set(blackCells);
    if (newBlackCells.has(key)) {
      newBlackCells.delete(key);
    } else {
      newBlackCells.add(key);
    }
    setBlackCells(newBlackCells);
    
    // Immediate update of visual state
    if (solverState) {
        const newCells = solverState.cells.map(row => row.map(cell => ({...cell})));
        newCells[r][c].isBlack = !newCells[r][c].isBlack;
        setSolverState({ ...solverState, cells: newCells });
    }
  };

  const handleStep = useCallback(() => {
    if (!solverState) return;
    setIsSolving(true);
    const result = applyRules(solverState);
    if (result.changed) {
      setSolverState(result.newState);
    } else {
      if (autoRunning) setAutoRunning(false);
    }
    return result.changed;
  }, [solverState, autoRunning]);

  // Auto Run Effect
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (autoRunning) {
      timer = setTimeout(() => {
        const changed = handleStep();
        if (!changed) {
          setAutoRunning(false);
        }
      }, speed);
    }
    return () => clearTimeout(timer);
  }, [autoRunning, handleStep, speed]);

  const handleReset = () => {
    setAutoRunning(false);
    setIsSolving(false);
    resetGrid(rows, cols, blackCells);
  };

  const handleImport = () => {
    // Regex matches: simpleloop/ROWS/COLS/DATA
    // Supported chars: 0-9, a-v (Base 32)
    const regex = /simpleloop\/(\d+)\/(\d+)\/([0-9a-v]+)/i;
    const match = importUrl.match(regex);

    if (!match) {
        alert("Invalid URL format. Expected format containing 'simpleloop/ROWS/COLS/DATA'");
        return;
    }

    const r = parseInt(match[1]);
    const c = parseInt(match[2]);
    const data = match[3];

    if (isNaN(r) || isNaN(c) || r < 3 || c < 3 || r > 30 || c > 30) {
        alert("Invalid dimensions parsed.");
        return;
    }

    const newBlackCells = new Set<string>();
    const totalCells = r * c;
    let cellIdx = 0;

    for (let i = 0; i < data.length; i++) {
        // Parse Base32 char (0-9, a-v) to integer
        const val = parseInt(data[i], 32);
        
        // Each char represents 5 cells. 
        // Logic: 0 = White, 1 = Black.
        // MSB corresponds to the first cell in the chunk.
        for (let bit = 4; bit >= 0; bit--) {
            if (cellIdx >= totalCells) break;
            
            const isBlack = (val >> bit) & 1;
            if (isBlack) {
                const row = Math.floor(cellIdx / c);
                const col = cellIdx % c;
                newBlackCells.add(`${row},${col}`);
            }
            cellIdx++;
        }
    }

    // Update State
    setRows(r);
    setCols(c);
    setBlackCells(newBlackCells);
    setImportUrl('');
    
    // Force reset immediately with new data
    resetGrid(r, c, newBlackCells);
  };

  if (!solverState) return <div>Loading...</div>;

  // SVG Rendering Helpers
  const width = cols * CELL_SIZE + GRID_PADDING * 2;
  const height = rows * CELL_SIZE + GRID_PADDING * 2;

  const renderHLine = (r: number, c: number, type: EdgeState) => {
    const x1 = GRID_PADDING + c * CELL_SIZE + CELL_SIZE / 2;
    const y1 = GRID_PADDING + r * CELL_SIZE + CELL_SIZE / 2;
    const x2 = x1 + CELL_SIZE;
    const y2 = y1;
    return renderEdge(x1, y1, x2, y2, type, `h-${r}-${c}`);
  };

  const renderVLine = (r: number, c: number, type: EdgeState) => {
    const x1 = GRID_PADDING + c * CELL_SIZE + CELL_SIZE / 2;
    const y1 = GRID_PADDING + r * CELL_SIZE + CELL_SIZE / 2;
    const x2 = x1;
    const y2 = y1 + CELL_SIZE;
    return renderEdge(x1, y1, x2, y2, type, `v-${r}-${c}`);
  };

  const renderEdge = (x1: number, y1: number, x2: number, y2: number, type: EdgeState, key: string) => {
    if (type === EdgeState.EMPTY) return null;

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    if (type === EdgeState.CROSS) {
      const size = 4;
      return (
        <g key={key} className="pointer-events-none">
          <line x1={cx - size} y1={cy - size} x2={cx + size} y2={cy + size} stroke="#ef4444" strokeWidth="2" />
          <line x1={cx + size} y1={cy - size} x2={cx - size} y2={cy + size} stroke="#ef4444" strokeWidth="2" />
        </g>
      );
    }

    const isDashed = type === EdgeState.DASHED;
    return (
      <line
        key={key}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={isDashed ? "#f59e0b" : "#4f46e5"} // Amber for dashed, Indigo for solid
        strokeWidth={isDashed ? 3 : 4}
        strokeDasharray={isDashed ? "5,5" : "none"}
        className="transition-all duration-300"
      />
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 text-slate-800">
      {/* Sidebar Controls */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 p-6 flex flex-col gap-6 shadow-sm z-10 overflow-y-auto">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
            <Grid3X3 className="text-indigo-600" />
            Simpleloop
          </h1>
          <p className="text-sm text-gray-500 mt-1">Logic Solver & Visualizer</p>
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Settings2 size={16} /> Configuration
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Width</label>
              <input 
                type="number" 
                min="3" max="20"
                value={cols}
                onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 3 && v <= 20) setCols(v);
                }}
                disabled={isSolving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Height</label>
              <input 
                type="number" 
                min="3" max="20"
                value={rows}
                onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 3 && v <= 20) setRows(v);
                }}
                disabled={isSolving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Zap size={12} className="text-amber-500" />
                Solve Speed (ms)
              </label>
              <input 
                type="number" 
                min="1" max="2000"
                value={speed}
                onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1) setSpeed(v);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-800 flex gap-2">
            <Info className="flex-shrink-0 w-4 h-4 mt-0.5" />
            <p>
              Click cells to toggle <span className="font-bold">Black Squares</span> (obstacles) before solving.
            </p>
          </div>
        </div>

        {/* Import */}
        <div className="space-y-2">
           <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <LinkIcon size={16} /> Import
          </h2>
          <div className="flex gap-2">
            <input 
                type="text"
                placeholder="Paste URL..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button 
                onClick={handleImport}
                disabled={!importUrl}
                className="bg-gray-800 text-white px-3 py-2 rounded-md hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Download size={14} />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Actions</h2>
          
          <button 
            onClick={() => handleStep()}
            disabled={autoRunning}
            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-indigo-600 text-indigo-700 hover:bg-indigo-50 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipForward size={18} />
            Step Once
          </button>

          <button 
            onClick={() => setAutoRunning(!autoRunning)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors text-white ${autoRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {autoRunning ? (
                <>Pause Auto</>
            ) : (
                <><Play size={18} /> Auto Solve</>
            )}
          </button>

          <button 
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2.5 rounded-lg font-medium transition-colors"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>

        {/* Legend */}
        <div className="mt-auto border-t pt-4">
           <h3 className="text-xs font-semibold text-gray-500 mb-2">Legend</h3>
           <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2"><div className="w-4 h-4 bg-black rounded-sm"></div> Obstacle</div>
              <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-indigo-600"></div> Solid Line</div>
              <div className="flex items-center gap-2"><div className="w-4 h-0.5 border-t-2 border-amber-500 border-dashed"></div> Dashed Line</div>
              <div className="flex items-center gap-2"><div className="text-red-500 font-bold">X</div> No Path</div>
           </div>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 bg-gray-50 overflow-auto flex items-center justify-center p-8">
        <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200 relative">
          <svg 
            width={width} 
            height={height} 
            className="select-none"
          >
            {/* Grid Background definition for dots */}
            <defs>
              <pattern id="grid-dots" x="0" y="0" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
                 <circle cx={CELL_SIZE/2} cy={CELL_SIZE/2} r="1" fill="#cbd5e1" />
              </pattern>
            </defs>
            
            {/* Render Cells */}
            {solverState.cells.map((row, r) => 
              row.map((cell, c) => (
                <g 
                    key={`cell-${r}-${c}`} 
                    onClick={() => handleCellClick(r, c)}
                    className={isSolving ? "" : "cursor-pointer hover:opacity-80"}
                >
                  {/* Cell Rect */}
                  <rect
                    x={GRID_PADDING + c * CELL_SIZE}
                    y={GRID_PADDING + r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill={cell.isBlack ? "#1e293b" : "#ffffff"}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    className="transition-colors duration-200"
                  />
                  
                  {/* Center Dot (only for white cells) */}
                  {!cell.isBlack && (
                    <circle
                      cx={GRID_PADDING + c * CELL_SIZE + CELL_SIZE / 2}
                      cy={GRID_PADDING + r * CELL_SIZE + CELL_SIZE / 2}
                      r={3}
                      fill="#94a3b8"
                    />
                  )}

                  {/* Group ID Debug (Optional, can be toggled in future, keeping hidden for aesthetics now) */}
                  {/* <text x={GRID_PADDING + c * CELL_SIZE + 5} y={GRID_PADDING + r * CELL_SIZE + 12} fontSize="8" fill="gray">{solverState.uf.find(cell.groupId)}</text> */}
                </g>
              ))
            )}

            {/* Render Edges */}
            {solverState.hEdges.map((row, r) => 
               row.map((edge, c) => renderHLine(r, c, edge))
            )}
            {solverState.vEdges.map((row, r) => 
               row.map((edge, c) => renderVLine(r, c, edge))
            )}

          </svg>
          
          {/* Status Overlay if needed */}
          {isSolving && !autoRunning && (
             <div className="absolute top-2 right-2 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">
               Solving Mode
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleLoopSolver;