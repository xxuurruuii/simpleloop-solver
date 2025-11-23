import { initializeState, applyRules, SolverState, EdgeState, Cell } from './services/logic';

// --- Constants ---
const CELL_SIZE = 40;
const GRID_PADDING = 20;

// --- DOM Elements ---
const canvas = document.getElementById('gridCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const inputRows = document.getElementById('input-rows') as HTMLInputElement;
const inputCols = document.getElementById('input-cols') as HTMLInputElement;
const inputSpeed = document.getElementById('input-speed') as HTMLInputElement;
const inputImport = document.getElementById('input-import') as HTMLInputElement;
const btnImport = document.getElementById('btn-import') as HTMLButtonElement;
const btnStep = document.getElementById('btn-step') as HTMLButtonElement;
const btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const statusBadge = document.getElementById('status-badge') as HTMLDivElement;

// --- State ---
let rows = 5;
let cols = 5;
let speed = 20;
let solverState: SolverState | null = null;
let isSolving = false;
let autoRunning = false;
let autoTimer: any = null;
let blackCells = new Set<string>();

// --- Initialization ---
function init() {
    updateDimensions();
    attachListeners();
    resetGame();
}

function updateDimensions() {
    rows = parseInt(inputRows.value);
    cols = parseInt(inputCols.value);
    // Resize Canvas
    const width = cols * CELL_SIZE + GRID_PADDING * 2;
    const height = rows * CELL_SIZE + GRID_PADDING * 2;
    
    // Handle High DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
}

function attachListeners() {
    inputRows.onchange = () => { if (!isSolving) { updateDimensions(); resetGame(); } };
    inputCols.onchange = () => { if (!isSolving) { updateDimensions(); resetGame(); } };
    inputSpeed.onchange = () => { speed = parseInt(inputSpeed.value); };
    
    canvas.addEventListener('click', handleCanvasClick);
    
    btnStep.onclick = handleStep;
    btnAuto.onclick = toggleAuto;
    btnReset.onclick = resetGame;
    btnImport.onclick = handleImport;
}

function handleCanvasClick(e: MouseEvent) {
    if (isSolving) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - GRID_PADDING;
    const y = e.clientY - rect.top - GRID_PADDING;

    if (x < 0 || y < 0) return;

    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);

    if (r >= 0 && r < rows && c >= 0 && c < cols) {
        const key = `${r},${c}`;
        if (blackCells.has(key)) {
            blackCells.delete(key);
        } else {
            blackCells.add(key);
        }
        
        // Update solver state purely for visual reflection
        if (solverState) {
            solverState.cells[r][c].isBlack = blackCells.has(key);
        }
        render();
    }
}

function resetGame() {
    stopAuto();
    isSolving = false;
    toggleInputs(true);
    
    const tempCells: Cell[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: Cell[] = [];
        for (let c = 0; c < cols; c++) {
            row.push({
                r, c,
                isBlack: blackCells.has(`${r},${c}`),
                groupId: r * cols + c
            });
        }
        tempCells.push(row);
    }
    
    solverState = initializeState(rows, cols, tempCells);
    render();
}

function toggleInputs(enabled: boolean) {
    inputRows.disabled = !enabled;
    inputCols.disabled = !enabled;
    if (enabled) {
        statusBadge.classList.add('hidden');
    } else {
        statusBadge.classList.remove('hidden');
    }
}

function startSolving() {
    if (!isSolving) {
        isSolving = true;
        toggleInputs(false);
    }
}

function handleStep() {
    startSolving();
    if (solverState) {
        const result = applyRules(solverState);
        if (result.changed) {
            solverState = result.newState;
            render();
            return true;
        } else {
            stopAuto();
            return false;
        }
    }
    return false;
}

function toggleAuto() {
    if (autoRunning) {
        stopAuto();
    } else {
        startSolving();
        autoRunning = true;
        btnAuto.textContent = "Pause Auto";
        btnAuto.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        btnAuto.classList.add('bg-red-500', 'hover:bg-red-600');
        runAutoLoop();
    }
}

function stopAuto() {
    autoRunning = false;
    clearTimeout(autoTimer);
    btnAuto.innerHTML = `Auto Solve`;
    btnAuto.classList.remove('bg-red-500', 'hover:bg-red-600');
    btnAuto.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
}

function runAutoLoop() {
    if (!autoRunning) return;
    
    const changed = handleStep();
    if (changed) {
        autoTimer = setTimeout(runAutoLoop, speed);
    }
}

function handleImport() {
    const val = inputImport.value;
    const regex = /simpleloop\/(\d+)\/(\d+)\/([0-9a-v]+)/i;
    const match = val.match(regex);

    if (!match) {
        alert("Invalid URL format.");
        return;
    }

    const r = parseInt(match[1]);
    const c = parseInt(match[2]);
    const data = match[3];

    if (isNaN(r) || isNaN(c)) return;

    inputRows.value = r.toString();
    inputCols.value = c.toString();
    blackCells.clear();

    let cellIdx = 0;
    const totalCells = r * c;

    for (let i = 0; i < data.length; i++) {
        const v = parseInt(data[i], 32);
        for (let bit = 4; bit >= 0; bit--) {
            if (cellIdx >= totalCells) break;
            if ((v >> bit) & 1) {
                const row = Math.floor(cellIdx / c);
                const col = cellIdx % c;
                blackCells.add(`${row},${col}`);
            }
            cellIdx++;
        }
    }
    
    updateDimensions();
    resetGame();
}

// --- Rendering ---
function render() {
    if (!solverState) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height); // clear rect uses scaled coords? No, need to use logical or reset transform? 
    // ctx is already scaled. 0,0 to width,height (logical) clears it.
    const logicalW = cols * CELL_SIZE + GRID_PADDING * 2;
    const logicalH = rows * CELL_SIZE + GRID_PADDING * 2;
    ctx.clearRect(0, 0, logicalW, logicalH);

    // Draw Cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = GRID_PADDING + c * CELL_SIZE;
            const y = GRID_PADDING + r * CELL_SIZE;
            const cell = solverState.cells[r][c];

            // Background
            ctx.fillStyle = cell.isBlack ? '#1e293b' : '#ffffff';
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            
            // Border
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

            // Dot
            if (!cell.isBlack) {
                ctx.fillStyle = '#94a3b8';
                ctx.beginPath();
                ctx.arc(x + CELL_SIZE/2, y + CELL_SIZE/2, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Draw Horizontal Edges
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const edge = solverState.hEdges[r][c];
            if (edge !== EdgeState.EMPTY) {
                const x1 = GRID_PADDING + c * CELL_SIZE + CELL_SIZE / 2;
                const y1 = GRID_PADDING + r * CELL_SIZE + CELL_SIZE / 2;
                const x2 = x1 + CELL_SIZE;
                drawEdge(x1, y1, x2, y1, edge);
            }
        }
    }

    // Draw Vertical Edges
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
            const edge = solverState.vEdges[r][c];
            if (edge !== EdgeState.EMPTY) {
                const x1 = GRID_PADDING + c * CELL_SIZE + CELL_SIZE / 2;
                const y1 = GRID_PADDING + r * CELL_SIZE + CELL_SIZE / 2;
                const y2 = y1 + CELL_SIZE;
                drawEdge(x1, y1, x1, y2, edge);
            }
        }
    }
}

function drawEdge(x1: number, y1: number, x2: number, y2: number, type: EdgeState) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    if (type === EdgeState.CROSS) {
        const size = 4;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cx - size, cy - size);
        ctx.lineTo(cx + size, cy + size);
        ctx.moveTo(cx + size, cy - size);
        ctx.lineTo(cx - size, cy + size);
        ctx.stroke();
    } else {
        ctx.strokeStyle = type === EdgeState.DASHED ? '#f59e0b' : '#4f46e5';
        ctx.lineWidth = type === EdgeState.DASHED ? 3 : 4;
        ctx.setLineDash(type === EdgeState.DASHED ? [5, 5] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// Start
init();
