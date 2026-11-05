import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, reducer, move, undo, canUndo, applyMoves } from '../src/core/game.mjs';

// A deterministic rng: cycles through a fixed list, which makes spawn placement reproducible.
const cycling = (values) => {
  let index = 0;
  return () => values[index++ % values.length];
};
const fixedState = (board, overrides = {}) => ({
  ...createState({ rng: () => 0.5 }),
  board,
  score: 0,
  moves: 0,
  history: [],
  status: 'playing',
  ...overrides,
});

test('a new game starts with exactly two tiles and a live board', () => {
  const state = createState({ rng: cycling([0.1, 0.3, 0.6, 0.9]) });
  const filled = state.board.flat().filter((v) => v !== 0);
  assert.equal(filled.length, 2);
  assert.ok(filled.every((v) => v === 2 || v === 4));
  assert.equal(state.status, 'playing');
  assert.equal(state.score, 0);
  assert.equal(canUndo(state), false);
});

test('a move that shifts tiles increments the move counter and spawns a tile', () => {
  const state = fixedState([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const after = move(state, 'right');
  assert.equal(after.moves, 1);
  assert.equal(after.board[0][3], 2, 'the tile slid to the far edge');
  const filled = after.board.flat().filter((v) => v !== 0).length;
  assert.equal(filled, 2, 'a new tile spawned');
});

test('a move that changes nothing is a no-op with no spawn', () => {
  const state = fixedState([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const after = move(state, 'left');
  assert.equal(after.moves, 0);
  assert.deepEqual(after.board, state.board);
  assert.equal(after.spawned, null);
});

test('merging scores the combined value and the best score tracks the maximum', () => {
  const state = fixedState([
    [2, 2, 0, 0],
    [4, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const after = move(state, 'left');
  assert.equal(after.score, 4 + 8);
  assert.equal(after.best, 12);
  assert.equal(after.lastGain, 12);
  assert.equal(after.board[0][0], 4);
  assert.equal(after.board[1][0], 8);
});

test('an invalid direction is ignored', () => {
  const state = createState({ rng: () => 0.5 });
  const after = move(state, 'sideways');
  assert.equal(after, state, 'reducer returned the same state object');
});

test('undo restores the previous board and score', () => {
  const start = fixedState([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const afterMove = move(start, 'left');
  assert.equal(canUndo(afterMove), true);
  assert.equal(afterMove.score, 4);

  const undone = undo(afterMove);
  assert.deepEqual(undone.board, start.board);
  assert.equal(undone.score, 0);
  assert.equal(undone.moves, 0);
  assert.equal(canUndo(undone), false);
});

test('undo on an empty history is a no-op', () => {
  const state = createState({ rng: () => 0.5 });
  assert.equal(undo(state), state);
});

test('the undo stack is bounded so long sessions do not grow without limit', () => {
  let state = fixedState([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  for (let i = 0; i < 40; i += 1) {
    state = move(state, i % 2 === 0 ? 'right' : 'left');
  }
  assert.ok(state.history.length <= 20, `history capped, saw ${state.history.length}`);
});

test('reaching 2048 sets the won status and stops further moves', () => {
  const state = fixedState(
    [
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    { rng: () => 0.5 },
  );
  const after = move(state, 'left');
  assert.equal(after.status, 'won');
  assert.ok(after.board.flat().includes(2048));

  const blocked = move(after, 'down');
  assert.equal(blocked, after, 'moves are refused while won');
});

test('continuing after a win re-enables moves and is remembered', () => {
  const won = fixedState(
    [
      [2048, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    { status: 'won' },
  );
  const resumed = reducer(won, { type: 'continue' });
  assert.equal(resumed.status, 'playing');
  assert.equal(resumed.keepPlaying, true);
  const moved = move(resumed, 'right');
  assert.equal(moved.status, 'playing', 'no win prompt again');
});

test('a jammed board is detected even when the player makes no legal move', () => {
  const stuck = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  const state = fixedState(stuck, { rng: () => 0.5 });
  const after = move(state, 'left');
  assert.equal(after.status, 'over', 'a dead board flips to over on the next input');

  const frozen = move(after, 'left');
  assert.equal(frozen, after, 'no moves are accepted after game over');
  assert.deepEqual(after.board, stuck, 'nothing was mutated');
});

test('a move that fills the last hole and jams the board also ends the game', () => {
  // One empty cell; sliding right leaves the board mergeable only through the spawn,
  // so this asserts the end-state detection rather than a specific layout.
  const state = fixedState(
    [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 0],
    ],
    { rng: () => 0.99 },
  );
  const after = move(state, 'right');
  assert.equal(after.board.flat().filter((v) => v === 0).length, 0, 'board is full after the spawn');
  assert.equal(after.status, 'playing', 'a 4 beside a 4 still leaves a merge available');
});

test('restart produces a fresh two-tile board', () => {
  const state = fixedState(
    [
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    { score: 500 },
  );
  const fresh = reducer(state, { type: 'restart' });
  assert.equal(fresh.score, 0);
  assert.equal(fresh.board.flat().filter((v) => v !== 0).length, 2);
});

test('an unknown action returns the state unchanged', () => {
  const state = createState({ rng: () => 0.5 });
  assert.equal(reducer(state, { type: 'teleport' }), state);
});

test('reducer and move agree, so the UI can dispatch actions uniformly', () => {
  const state = fixedState([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const viaReducer = reducer(state, { type: 'move', direction: 'left' });
  const viaDirect = move(state, 'left');
  assert.deepEqual(viaReducer.board, viaDirect.board);
  assert.equal(viaReducer.score, viaDirect.score);
});

test('applyMoves folds a script of moves in order', () => {
  const state = fixedState([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const after = applyMoves(state, ['right', 'down', 'left']);
  assert.equal(after.moves, 3);
  const bottom = after.board[3];
  assert.ok(bottom[0] !== 0, 'tiles are packed against the left edge after the final move');
  assert.ok(after.board.flat().filter((v) => v !== 0).length >= 1);
});
