
export enum EdgeState {
  EMPTY = 0,
  SOLID = 1,
  CROSS = 2,
  DASHED = 3,
}

export interface Cell {
  r: number;
  c: number;
  isBlack: boolean;
  groupId: number; // Unique ID for set
}

// Union-Find (Disjoint Set Union) for tracking connected components
export class UnionFind {
  parent: number[];
  size: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = Array(n).fill(1);
  }

  find(i: number): number {
    if (this.parent[i] === i) {
      return i;
    }
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }

  union(i: number, j: number): void {
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

  getSize(i: number): number {
    return this.size[this.find(i)];
  }
}

export interface SolverState {
  rows: number;
  cols: number;
  cells: Cell[][];
  hEdges: EdgeState[][]; // [r][c] represents edge between (r,c) and (r,c+1)
  vEdges: EdgeState[][]; // [r][c] represents edge between (r+1,c) and (r,c)
  uf: UnionFind;
}

export const initializeState = (rows: number, cols: number, existingCells?: Cell[][]): SolverState => {
  const totalCells = rows * cols;
  const uf = new UnionFind(totalCells);

  const cells: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
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

  const hEdges = Array.from({ length: rows }, () => Array(cols - 1).fill(EdgeState.EMPTY));
  const vEdges = Array.from({ length: rows - 1 }, () => Array(cols).fill(EdgeState.EMPTY));

  return { rows, cols, cells, hEdges, vEdges, uf };
};

// Helper to get neighbor info
interface NeighborInfo {
  r: number;
  c: number;
  dir: 'up' | 'down' | 'left' | 'right';
  edgeState: EdgeState;
  setEdge: (s: EdgeState) => void;
}

// Returns a NEW state (deep copyish where needed) and a boolean indicating if changes occurred
export const applyRules = (currentState: SolverState): { newState: SolverState; changed: boolean } => {
  const rows = currentState.rows;
  const cols = currentState.cols;
  
  // Working copy
  const nextHEdges = currentState.hEdges.map(row => [...row]);
  const nextVEdges = currentState.vEdges.map(row => [...row]);
  
  const getCellId = (r: number, c: number) => r * cols + c;

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
  const whiteCellIds: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!currentState.cells[r][c].isBlack) {
        whiteCellIds.push(getCellId(r, c));
      }
    }
  }

  if (whiteCellIds.length > 0) {
    const uniqueRoots = new Set<number>();
    for (const id of whiteCellIds) {
      uniqueRoots.add(nextUf.find(id));
    }
    distinctComponents = uniqueRoots.size;
  }

  let changed = false;

  const setEdge = (r: number, c: number, dir: 'up'|'down'|'left'|'right', s: EdgeState) => {
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
             distinctComponents--;
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

  const getLiveNeighbors = (r: number, c: number) => {
    const n: NeighborInfo[] = [];
    if (r > 0) n.push({ r: r-1, c, dir: 'up', edgeState: nextVEdges[r-1][c], setEdge: (s) => setEdge(r, c, 'up', s) });
    if (r < rows - 1) n.push({ r: r+1, c, dir: 'down', edgeState: nextVEdges[r][c], setEdge: (s) => setEdge(r, c, 'down', s) });
    if (c > 0) n.push({ r, c: c-1, dir: 'left', edgeState: nextHEdges[r][c-1], setEdge: (s) => setEdge(r, c, 'left', s) });
    if (c < cols - 1) n.push({ r, c: c+1, dir: 'right', edgeState: nextHEdges[r][c], setEdge: (s) => setEdge(r, c, 'right', s) });
    return n;
  };

  // --- Rule 1: Degree 2 ---
  // If a cell only has 2 valid neighbors, connect them.
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
  // If a cell has 2 Solid lines, cross others.
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

  // --- Rule 3: Loop Prevention ---
  // If two neighbors belong to the same group but no line (Solid/Dashed) exists, Cross.
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
  // If not connected to any group, and adjacent groups count == 2
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
         const neighborGroups = new Set<number>();
         const neighborGroupCounts = new Map<number, number>();

         validNeighbors.forEach(n => {
             const nId = getCellId(n.r, n.c);
             const gId = nextUf.find(nId);
             neighborGroups.add(gId);
             neighborGroupCounts.set(gId, (neighborGroupCounts.get(gId) || 0) + 1);
         });

         if (neighborGroups.size === 2) {
             let applied = false;
             validNeighbors.forEach(n => {
                 const nId = getCellId(n.r, n.c);
                 const root = nextUf.find(nId);
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
  // If a cell has exactly 1 Solid line, and all other available neighbors belong to the same group,
  // mark those neighbors as DASHED.
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
           const targetGroups = new Set<number>();
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
