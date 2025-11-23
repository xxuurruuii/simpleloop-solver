// --- Logic Service (Originally services/logic.ts) ---

const EdgeState = {
  EMPTY: 0,
  SOLID: 1,
  CROSS: 2,
  DASHED: 3,
};

// Union-Find (Disjoint Set Union) for tracking connected components
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = Array(n).fill(1);
  }

  find(i) {
    if (this.parent[i] === i) {
      return i;
    }
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }

  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      // Merge smaller into larger
      if (this.size[rootI] < this.size[rootJ]) {
        this.parent[rootI] = rootJ;
        this.size[rootJ] += this.size[rootI];
      } else {
        this.parent[rootJ] = rootI;
        this.size[rootI] += this.size[rootJ];
      }
    }
  }

  getSize(i) {
    return this.size[this.find(i)];
  }
}

const initializeState = (rows, cols, existingCells) => {
  const totalCells = rows * cols;
  const uf = new UnionFind(totalCells);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const isBlack = existingCells && existingCells[r] && existingCells[r][c] ? existingCells[r][c].isBlack : false;
      row.push({
        r,
        c,
        isBlack,
        groupId: r * cols + c,
      });
    }
    cells.push(row);
  }

  // Initialize edges
  // Preprocessing: Mark edges around black cells as CROSS
  const hEdges = Array.from({ length: rows }, () => Array(cols - 1).fill(EdgeState.EMPTY));
  const vEdges = Array.from({ length: rows - 1 }, () => Array(cols).fill(EdgeState.EMPTY));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].isBlack) {
        // Top
        if (r > 0) vEdges[r - 1][c] = EdgeState.CROSS;
        // Bottom
        if (r < rows - 1) vEdges[r][c] = EdgeState.CROSS;
        // Left
        if (c > 0) hEdges[r][c - 1] = EdgeState.CROSS;
        // Right
        if (c < cols - 1) hEdges[r][c] = EdgeState.CROSS;
      }
    }
  }

  return { rows, cols, cells, hEdges, vEdges, uf };
};

// Helper: Build Adjacency List for Graph Algorithms
// Nodes are cell indices (0 to rows*cols - 1)
// Edges are connections where state is NOT CROSS
const buildAdjacency = (rows, cols, cells, hEdges, vEdges, ignoreEdge = null) => {
    const adj = Array.from({ length: rows * cols }, () => []);
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (cells[r][c].isBlack) continue;
            const u = r * cols + c;

            // Check Right Neighbor
            if (c < cols - 1) {
                const isIgnored = ignoreEdge && ignoreEdge.type === 'h' && ignoreEdge.r === r && ignoreEdge.c === c;
                if (!isIgnored) {
                    const val = hEdges[r][c];
                    if (val !== EdgeState.CROSS && !cells[r][c+1].isBlack) {
                        const v = r * cols + c + 1;
                        const edgeData = { to: v, r, c, type: 'h' };
                        adj[u].push(edgeData);
                        adj[v].push({ to: u, r, c, type: 'h' }); // Undirected
                    }
                }
            }
            
            // Check Bottom Neighbor
            if (r < rows - 1) {
                const isIgnored = ignoreEdge && ignoreEdge.type === 'v' && ignoreEdge.r === r && ignoreEdge.c === c;
                if (!isIgnored) {
                    const val = vEdges[r][c];
                    if (val !== EdgeState.CROSS && !cells[r+1][c].isBlack) {
                        const v = (r + 1) * cols + c;
                        const edgeData = { to: v, r, c, type: 'v' };
                        adj[u].push(edgeData);
                        adj[v].push({ to: u, r, c, type: 'v' });
                    }
                }
            }
        }
    }
    return adj;
};

// Helper: Tarjan's Bridge-Finding Algorithm
const findBridges = (numNodes, adj) => {
    const bridges = [];
    const disc = new Int32Array(numNodes).fill(-1);
    const low = new Int32Array(numNodes).fill(-1);
    const parent = new Int32Array(numNodes).fill(-1);
    let time = 0;

    const dfs = (u) => {
        disc[u] = low[u] = ++time;
        
        for (const edge of adj[u]) {
            const v = edge.to;
            if (v === parent[u]) continue;
            
            if (disc[v] !== -1) {
                low[u] = Math.min(low[u], disc[v]);
            } else {
                parent[v] = u;
                dfs(v);
                low[u] = Math.min(low[u], low[v]);
                if (low[v] > disc[u]) {
                    bridges.push(edge);
                }
            }
        }
    };

    for (let i = 0; i < numNodes; i++) {
        // Only start DFS if node is part of the graph (has adjacency) and not visited
        if (adj[i].length > 0 && disc[i] === -1) {
            dfs(i);
        }
    }
    return bridges;
};

// Returns a NEW state (deep copyish where needed) and a boolean indicating if changes occurred
const applyRules = (currentState) => {
  const rows = currentState.rows;
  const cols = currentState.cols;
  
  // Working copy
  const nextHEdges = currentState.hEdges.map(row => [...row]);
  const nextVEdges = currentState.vEdges.map(row => [...row]);
  
  const getCellId = (r, c) => r * cols + c;

  // Rebuilding UF from current edge state
  const nextUf = new UnionFind(rows * cols);
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Horizontal
      if (c < cols - 1) {
        const edge = currentState.hEdges[r][c];
        if (edge === EdgeState.SOLID || edge === EdgeState.DASHED) {
          nextUf.union(getCellId(r, c), getCellId(r, c + 1));
        }
      }
      // Vertical
      if (r < rows - 1) {
        const edge = currentState.vEdges[r][c];
        if (edge === EdgeState.SOLID || edge === EdgeState.DASHED) {
          nextUf.union(getCellId(r, c), getCellId(r + 1, c));
        }
      }
    }
  }

  // Count distinct groups of valid (white) cells
  let distinctComponents = 0;
  const whiteCellIds = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!currentState.cells[r][c].isBlack) {
        whiteCellIds.push(getCellId(r, c));
      }
    }
  }

  if (whiteCellIds.length > 0) {
    const uniqueRoots = new Set();
    for (const id of whiteCellIds) {
      uniqueRoots.add(nextUf.find(id));
    }
    distinctComponents = uniqueRoots.size;
  }

  let changed = false;

  const setEdge = (r, c, dir, s) => {
    let currentS = EdgeState.EMPTY;
    if (dir === 'up') currentS = nextVEdges[r - 1][c];
    if (dir === 'down') currentS = nextVEdges[r][c];
    if (dir === 'left') currentS = nextHEdges[r][c - 1];
    if (dir === 'right') currentS = nextHEdges[r][c];

    if (currentS !== s) {
      if (dir === 'up') nextVEdges[r - 1][c] = s;
      if (dir === 'down') nextVEdges[r][c] = s;
      if (dir === 'left') nextHEdges[r][c - 1] = s;
      if (dir === 'right') nextHEdges[r][c] = s;
      changed = true;
      
      // Update UF locally to support rule chaining within the same step if needed,
      // though major logic relies on the initial UF build.
      if (s === EdgeState.SOLID || s === EdgeState.DASHED) {
         let r2 = r, c2 = c;
         if (dir === 'up') r2 = r - 1;
         if (dir === 'down') r2 = r + 1;
         if (dir === 'left') c2 = c - 1;
         if (dir === 'right') c2 = c + 1;
         
         const id1 = getCellId(r, c);
         const id2 = getCellId(r2, c2);
         const root1 = nextUf.find(id1);
         const root2 = nextUf.find(id2);
         if (root1 !== root2) {
             nextUf.union(id1, id2);
         }
      }
    }
  };

  const finalizeStep = () => ({
    changed: true,
    newState: {
      ...currentState,
      hEdges: nextHEdges,
      vEdges: nextVEdges,
      uf: nextUf
    }
  });

  const getLiveNeighbors = (r, c) => {
    const n = [];
    if (r > 0) n.push({ r: r-1, c, dir: 'up', edgeState: nextVEdges[r-1][c], setEdge: (s) => setEdge(r, c, 'up', s) });
    if (r < rows - 1) n.push({ r: r+1, c, dir: 'down', edgeState: nextVEdges[r][c], setEdge: (s) => setEdge(r, c, 'down', s) });
    if (c > 0) n.push({ r, c: c-1, dir: 'left', edgeState: nextHEdges[r][c-1], setEdge: (s) => setEdge(r, c, 'left', s) });
    if (c < cols - 1) n.push({ r, c: c+1, dir: 'right', edgeState: nextHEdges[r][c], setEdge: (s) => setEdge(r, c, 'right', s) });
    return n;
  };

  // --- Rule 1: Degree 2 ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = currentState.cells[r][c];
      if (cell.isBlack) continue;
      
      const neighbors = getLiveNeighbors(r, c);
      const validNeighbors = neighbors.filter(n => {
        const nCell = currentState.cells[n.r][n.c];
        return !nCell.isBlack && n.edgeState !== EdgeState.CROSS;
      });

      if (validNeighbors.length === 2) {
        let applied = false;
        validNeighbors.forEach(n => {
           if (n.edgeState !== EdgeState.SOLID) {
             n.setEdge(EdgeState.SOLID);
             applied = true;
           }
        });
        if (applied || changed) return finalizeStep();
      }
    }
  }

  // --- Rule 2: Max Degree ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = currentState.cells[r][c];
      if (cell.isBlack) continue;

      const neighbors = getLiveNeighbors(r, c);
      const currentSolidCount = neighbors.filter(n => n.edgeState === EdgeState.SOLID).length;
      if (currentSolidCount === 2) {
        let applied = false;
        neighbors.forEach(n => {
          if (n.edgeState !== EdgeState.SOLID && n.edgeState !== EdgeState.CROSS) {
            n.setEdge(EdgeState.CROSS);
            applied = true;
          }
        });
        if (applied || changed) return finalizeStep();
      }
    }
  }
  
  // --- Rule 6: Graph Cut Analysis (Global) ---
  const adj = buildAdjacency(rows, cols, currentState.cells, nextHEdges, nextVEdges);
  const bridges = findBridges(rows * cols, adj);
  
  if (bridges.length > 0) {
      let applied = false;
      for (const b of bridges) {
          let currentVal = (b.type === 'h') ? nextHEdges[b.r][b.c] : nextVEdges[b.r][b.c];
          if (currentVal !== EdgeState.SOLID) {
               if (b.type === 'h') nextHEdges[b.r][b.c] = EdgeState.SOLID;
               else nextVEdges[b.r][b.c] = EdgeState.SOLID;
               applied = true;
          }
      }
      if (applied || changed) return finalizeStep();
  }

  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
        // Horizontal Candidates
        if (c < cols - 1) {
            if (nextHEdges[r][c] === EdgeState.EMPTY && !currentState.cells[r][c].isBlack && !currentState.cells[r][c+1].isBlack) {
                candidates.push({ r, c, type: 'h' });
            }
        }
        // Vertical Candidates
        if (r < rows - 1) {
            if (nextVEdges[r][c] === EdgeState.EMPTY && !currentState.cells[r][c].isBlack && !currentState.cells[r+1][c].isBlack) {
                candidates.push({ r, c, type: 'v' });
            }
        }
    }
  }

  for (const cand of candidates) {
      const tempAdj = buildAdjacency(rows, cols, currentState.cells, nextHEdges, nextVEdges, cand);
      const tempBridges = findBridges(rows * cols, tempAdj);
      
      if (tempBridges.length > 0) {
          let applied = false;
          
          if (cand.type === 'h') nextHEdges[cand.r][cand.c] = EdgeState.SOLID;
          else nextVEdges[cand.r][cand.c] = EdgeState.SOLID;
          applied = true;
          
          for (const b of tempBridges) {
              if (b.type === 'h') {
                  if (nextHEdges[b.r][b.c] !== EdgeState.SOLID) {
                      nextHEdges[b.r][b.c] = EdgeState.SOLID;
                      applied = true;
                  }
              } else {
                  if (nextVEdges[b.r][b.c] !== EdgeState.SOLID) {
                      nextVEdges[b.r][b.c] = EdgeState.SOLID;
                      applied = true;
                  }
              }
          }
          if (applied) return finalizeStep();
      }
  }

  // --- Rule 3: Loop Prevention ---
  if (distinctComponents > 1) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = currentState.cells[r][c];
        if (cell.isBlack) continue;

        const neighbors = getLiveNeighbors(r, c);
        let applied = false;
        neighbors.forEach(n => {
           if (n.edgeState === EdgeState.EMPTY) {
              const nCell = currentState.cells[n.r][n.c];
              if (!nCell.isBlack) {
                 const myRoot = nextUf.find(getCellId(r, c));
                 const nRoot = nextUf.find(getCellId(n.r, n.c));
                 if (myRoot === nRoot) {
                    n.setEdge(EdgeState.CROSS);
                    applied = true;
                 }
              }
           }
        });
        if (applied || changed) return finalizeStep();
      }
    }
  }

  // --- Rule 4: Bridge/Dashed Logic ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = currentState.cells[r][c];
      if (cell.isBlack) continue;

      const neighbors = getLiveNeighbors(r, c);
      const validNeighbors = neighbors.filter(n => {
        const nCell = currentState.cells[n.r][n.c];
        return !nCell.isBlack && n.edgeState !== EdgeState.CROSS;
      });
      const isConnectedNow = neighbors.some(n => n.edgeState === EdgeState.SOLID || n.edgeState === EdgeState.DASHED);
      
      if (!isConnectedNow) {
         const neighborGroups = new Set();
         const neighborGroupCounts = new Map();
         
         // Fix: Snapshot neighbor groups BEFORE iterating.
         // If we iterate and call setEdge(SOLID), nextUf changes, which can confuse subsequent lookups
         // for other neighbors if groups merge.
         const neighborGroupIds = new Map(); // neighbor index in validNeighbors -> groupID

         validNeighbors.forEach((n, idx) => {
             const nId = getCellId(n.r, n.c);
             const gId = nextUf.find(nId);
             neighborGroupIds.set(idx, gId);
             
             neighborGroups.add(gId);
             neighborGroupCounts.set(gId, (neighborGroupCounts.get(gId) || 0) + 1);
         });

         if (neighborGroups.size === 2) {
             let applied = false;
             validNeighbors.forEach((n, idx) => {
                 // Use the snapshot group ID, not the live one
                 const root = neighborGroupIds.get(idx);
                 const groupFrequency = neighborGroupCounts.get(root) || 0;

                 if (n.edgeState === EdgeState.EMPTY) {
                     if (groupFrequency === 1) {
                         n.setEdge(EdgeState.SOLID);
                         applied = true;
                     } else {
                         n.setEdge(EdgeState.DASHED);
                         applied = true;
                     } 
                 }
             });
             if (applied || changed) return finalizeStep();
         }
      }
    }
  }

  // --- Rule 5: Single Exit Group Consistency ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = currentState.cells[r][c];
      if (cell.isBlack) continue;

      const neighbors = getLiveNeighbors(r, c);
      const solidNeighbors = neighbors.filter(n => n.edgeState === EdgeState.SOLID);
      if (solidNeighbors.length === 1) {
        const availableNeighbors = neighbors.filter(n => 
           !currentState.cells[n.r][n.c].isBlack && 
           n.edgeState !== EdgeState.SOLID && 
           n.edgeState !== EdgeState.CROSS
        );
        
        if (availableNeighbors.length > 0) {
           const targetGroups = new Set();
           availableNeighbors.forEach(n => {
              targetGroups.add(nextUf.find(getCellId(n.r, n.c)));
           });
           
           if (targetGroups.size === 1) {
              let applied = false;
              availableNeighbors.forEach(n => {
                 if (n.edgeState === EdgeState.EMPTY) {
                    n.setEdge(EdgeState.DASHED);
                    applied = true;
                 }
              });
              if (applied || changed) return finalizeStep();
           }
        }
      }
    }
  }

  return {
    changed: false,
    newState: {
      ...currentState,
      hEdges: nextHEdges,
      vEdges: nextVEdges,
      uf: nextUf
    }
  };
};

// --- App Logic (Originally index.tsx) ---

const CELL_SIZE = 40;
const GRID_PADDING = 20;

const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d');
const inputRows = document.getElementById('input-rows');
const inputCols = document.getElementById('input-cols');
const inputSpeed = document.getElementById('input-speed');
const inputImport = document.getElementById('input-import');
const btnImport = document.getElementById('btn-import');
const btnStep = document.getElementById('btn-step');
const btnAuto = document.getElementById('btn-auto');
const btnReset = document.getElementById('btn-reset');
const statusBadge = document.getElementById('status-badge');

let rows = 5;
let cols = 5;
let speed = 20;
let solverState = null;
let isSolving = false;
let autoRunning = false;
let autoTimer = null;
let blackCells = new Set();

function init() {
    updateDimensions();
    attachListeners();
    resetGame();
}

function updateDimensions() {
    rows = parseInt(inputRows.value);
    cols = parseInt(inputCols.value);
    
    const width = cols * CELL_SIZE + GRID_PADDING * 2;
    const height = rows * CELL_SIZE + GRID_PADDING * 2;
    
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

function handleCanvasClick(e) {
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
    
    const tempCells = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
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

function toggleInputs(enabled) {
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
        // Re-initialize to ensure black cell preprocessing is applied if not already
        const tempCells = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
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

    const c = parseInt(match[1]);
    const r = parseInt(match[2]);
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

function render() {
    if (!solverState) return;

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

function drawEdge(x1, y1, x2, y2, type) {
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