// 2048 board primitives. Everything here is pure: give it a board, get a new board back.
// A board is a 4x4 array of numbers, where 0 means empty.

export const SIZE = 4;
export const WIN_TILE = 2048;

export function emptyBoard(size = SIZE) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

/** Collapses one row toward index 0, merging equal neighbours exactly once per move. */
export function collapseRow(row) {
  const tiles = row.filter((value) => value !== 0);
  const result = [];
  let gained = 0;
  let merged = false;

  for (let i = 0; i < tiles.length; i += 1) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const combined = tiles[i] * 2;
      result.push(combined);
      gained += combined;
      merged = true;
      i += 1; // Skip the consumed tile: a merge happens at most once per pair.
    } else {
      result.push(tiles[i]);
    }
  }

  while (result.length < row.length) result.push(0);
  const moved = result.some((value, index) => value !== row[index]);
  return { row: result, gained, merged, moved };
}

/** Direction vectors expressed as (rowDelta, colDelta) with a flag for traversal order. */
export const DIRECTION_VECTORS = {
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
};

export function boardSize(board) {
  return board.length;
}

/** Reads the line of cells starting at (r, c) moving along the direction, for the whole board. */
export function lineFor(board, direction, index) {
  const size = boardSize(board);
  if (direction === 'left' || direction === 'right') {
    const row = board[index];
    return direction === 'left' ? row.slice() : row.slice().reverse();
  }
  const column = Array.from({ length: size }, (_, r) => board[r][index]);
  return direction === 'up' ? column : column.reverse();
}

/** Writes a collapsed line back into the board. Returns nothing; mutates the given board. */
export function writeLine(board, direction, index, line) {
  const size = boardSize(board);
  if (direction === 'left' || direction === 'right') {
    board[index] = direction === 'left' ? line.slice() : line.slice().reverse();
    return;
  }
  const values = direction === 'up' ? line : line.slice().reverse();
  for (let r = 0; r < size; r += 1) board[r][index] = values[r];
}

/**
 * Slides every tile toward `direction`. Returns the new board, points gained, and whether anything
 * moved, so the caller can decide whether a random tile should spawn.
 */
export function slide(board, direction) {
  const size = boardSize(board);
  const next = cloneBoard(board);
  let gained = 0;
  let moved = false;
  const movements = [];
  const merges = [];

  for (let index = 0; index < size; index += 1) {
    const line = lineFor(board, direction, index);
    const coordinate = (offset) => {
      const position = direction === 'right' || direction === 'down' ? size - 1 - offset : offset;
      return direction === 'left' || direction === 'right' ? [index, position] : [position, index];
    };
    const occupied = line.flatMap((value, offset) => value ? [{ value, offset }] : []);
    let destination = 0;
    for (let i = 0; i < occupied.length; i += 1) {
      const tile = occupied[i];
      const to = coordinate(destination++);
      movements.push({ from: coordinate(tile.offset), to, value: tile.value });
      if (occupied[i + 1]?.value === tile.value) {
        movements.push({ from: coordinate(occupied[++i].offset), to, value: tile.value });
        merges.push({ r: to[0], c: to[1], value: tile.value * 2 });
      }
    }
    const collapsed = collapseRow(line);
    writeLine(next, direction, index, collapsed.row);
    gained += collapsed.gained;
    if (collapsed.moved) moved = true;
  }

  return { board: next, gained, moved, movements, merges };
}

export function emptyCells(board) {
  const cells = [];
  for (let r = 0; r < boardSize(board); r += 1) {
    for (let c = 0; c < boardSize(board); c += 1) {
      if (board[r][c] === 0) cells.push([r, c]);
    }
  }
  return cells;
}

/** Spawns a 2 (90%) or 4 (10%) in a random empty cell. Deterministic given the rng. */
export function spawnTile(board, rng = Math.random) {
  const cells = emptyCells(board);
  if (cells.length === 0) return null;
  const [r, c] = cells[Math.floor(rng() * cells.length)];
  const value = rng() < 0.9 ? 2 : 4;
  board[r][c] = value;
  return { r, c, value };
}

export function hasMoves(board) {
  if (emptyCells(board).length > 0) return true;
  const size = boardSize(board);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = board[r][c];
      if (c + 1 < size && board[r][c + 1] === value) return true;
      if (r + 1 < size && board[r + 1][c] === value) return true;
    }
  }
  return false;
}

export function maxTile(board) {
  return Math.max(...board.flat());
}

export function tiles(board) {
  const list = [];
  for (let r = 0; r < boardSize(board); r += 1) {
    for (let c = 0; c < boardSize(board); c += 1) {
      if (board[r][c] !== 0) list.push({ r, c, value: board[r][c] });
    }
  }
  return list;
}

export function boardToString(board) {
  const width = String(maxTile(board)).length;
  return board.map((row) => row.map((v) => String(v).padStart(width, '.')).join(' ')).join('\n');
}
