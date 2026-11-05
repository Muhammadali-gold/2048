// 2048 game state as a reducer: (state, action) -> state. Views only read state and dispatch.
//
// Keeping the reducer pure means undo, persistence and tests all share one code path.

import { SIZE, WIN_TILE, emptyBoard, slide, spawnTile, hasMoves, maxTile, cloneBoard } from './board.mjs';

export const DIRECTIONS = ['left', 'right', 'up', 'down'];

export function createState({ rng = Math.random, size = SIZE } = {}) {
  const board = emptyBoard(size);
  spawnTile(board, rng);
  spawnTile(board, rng);
  return {
    board,
    score: 0,
    best: 0,
    moves: 0,
    status: 'playing', // playing | won | over
    keepPlaying: false,
    history: [],
    rng,
    lastGain: 0,
    spawned: null,
  };
}

function pushHistory(state) {
  // A bounded undo stack (last 20 moves) keeps memory flat during long sessions.
  const history = state.history.concat([{ board: cloneBoard(state.board), score: state.score }]);
  return history.slice(-20);
}

export function reducer(state, action) {
  switch (action.type) {
    case 'move':
      return move(state, action.direction);
    case 'undo':
      return undo(state);
    case 'continue':
      return { ...state, status: 'playing', keepPlaying: true };
    case 'restart':
      return createState({ rng: state.rng });
    default:
      return state;
  }
}

export function move(state, direction) {
  if (!DIRECTIONS.includes(direction)) return state;
  if (state.status === 'over') return state;
  if (state.status === 'won' && !state.keepPlaying) return state;

  const result = slide(state.board, direction);
  if (!result.moved) {
    // A board can be stuck before any input arrives (e.g. restored from storage), so the
    // no-op path still has to detect the dead end.
    return {
      ...state,
      lastGain: 0,
      spawned: null,
      status: hasMoves(state.board) ? state.status : 'over',
    };
  }

  const board = result.board;
  const spawned = spawnTile(board, state.rng);
  const score = state.score + result.gained;
  const best = Math.max(state.best, score);
  const reachedWin = maxTile(board) >= WIN_TILE && !state.keepPlaying;
  const outOfMoves = !hasMoves(board);

  return {
    ...state,
    board,
    score,
    best,
    moves: state.moves + 1,
    history: pushHistory(state),
    lastGain: result.gained,
    spawned,
    status: reachedWin ? 'won' : outOfMoves ? 'over' : 'playing',
  };
}

export function undo(state) {
  if (state.history.length === 0) return state;
  const history = state.history.slice(0, -1);
  const previous = state.history[state.history.length - 1];
  return {
    ...state,
    board: previous.board,
    score: previous.score,
    history,
    moves: Math.max(0, state.moves - 1),
    status: 'playing',
    lastGain: 0,
    spawned: null,
  };
}

export function canUndo(state) {
  return state.history.length > 0;
}

/** Convenience for tests and the CLI: apply a list of moves. */
export function applyMoves(state, moves) {
  return moves.reduce((current, direction) => move(current, direction), state);
}
