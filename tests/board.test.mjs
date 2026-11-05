import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIZE,
  emptyBoard,
  collapseRow,
  slide,
  spawnTile,
  emptyCells,
  hasMoves,
  maxTile,
  tiles,
  lineFor,
  writeLine,
} from '../src/core/board.mjs';

test('a new board is square and empty', () => {
  const board = emptyBoard();
  assert.equal(board.length, SIZE);
  assert.ok(board.every((row) => row.length === SIZE));
  assert.equal(emptyCells(board).length, SIZE * SIZE);
});

test('collapsing merges equal neighbours once and shifts out the zeros', () => {
  assert.deepEqual(collapseRow([2, 2, 0, 0]).row, [4, 0, 0, 0]);
  assert.deepEqual(collapseRow([2, 2, 2, 0]).row, [4, 2, 0, 0]);
  assert.deepEqual(collapseRow([2, 2, 2, 2]).row, [4, 4, 0, 0]);
  assert.deepEqual(collapseRow([4, 4, 8, 0]).row, [8, 8, 0, 0]);
  assert.deepEqual(collapseRow([2, 0, 2, 4]).row, [4, 4, 0, 0]);
});

test('three equal tiles merge leftmost-first, not into a chain', () => {
  // 2,2,2 must become 4,2 -- not 8. This is the classic 2048 chain-merge bug.
  const result = collapseRow([2, 2, 2, 0]);
  assert.deepEqual(result.row, [4, 2, 0, 0]);
  assert.equal(result.gained, 4);
});

test('a row that cannot merge reports no movement', () => {
  const result = collapseRow([2, 4, 8, 16]);
  assert.equal(result.moved === true, false);
  assert.equal(result.merged, false);
  assert.equal(result.gained, 0);
});

test('merge scoring equals the value of every tile created', () => {
  assert.equal(collapseRow([2, 2, 4, 4]).gained, 4 + 8);
  assert.equal(collapseRow([2, 2, 2, 2]).gained, 8);
  assert.equal(collapseRow([0, 0, 0, 0]).gained, 0);
});

test('sliding left packs tiles to the left edge', () => {
  const board = [
    [0, 0, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const { board: next, gained, moved } = slide(board, 'left');
  assert.deepEqual(next[0], [4, 0, 0, 0]);
  assert.equal(gained, 4);
  assert.equal(moved, true);
});

test('sliding right packs tiles to the right edge', () => {
  const board = [
    [2, 0, 0, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const { board: next } = slide(board, 'right');
  assert.deepEqual(next[0], [0, 0, 0, 4]);
});

test('sliding up and down operate on columns', () => {
  const board = [
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const up = slide(board, 'up').board;
  assert.equal(up[0][0], 4);
  assert.equal(up[1][0], 0);

  const down = slide(board, 'down').board;
  assert.equal(down[3][0], 4);
  assert.equal(down[0][0], 0);
});

test('a slide that changes nothing reports moved: false', () => {
  const board = [
    [2, 4, 8, 16],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  assert.equal(slide(board, 'left').moved, false);
  assert.equal(slide(board, 'up').moved, false);
});

test('sliding never mutates the input board', () => {
  const board = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const snapshot = JSON.stringify(board);
  slide(board, 'left');
  assert.equal(JSON.stringify(board), snapshot);
});

test('spawning fills exactly one empty cell with a 2 or a 4', () => {
  const board = emptyBoard();
  const spawned = spawnTile(board, () => 0.5);
  assert.ok(spawned);
  assert.ok([2, 4].includes(spawned.value));
  assert.equal(emptyCells(board).length, SIZE * SIZE - 1);
  assert.equal(board[spawned.r][spawned.c], spawned.value);
});

test('spawning on a full board returns null and changes nothing', () => {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(2));
  assert.equal(spawnTile(board, () => 0.5), null);
});

test('hasMoves is true with empties and false only when truly stuck', () => {
  assert.equal(hasMoves(emptyBoard()), true);

  const stuck = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  assert.equal(hasMoves(stuck), false, 'alternating board is dead');

  const almost = stuck.map((row) => row.slice());
  almost[2][2] = 4;
  almost[2][3] = 4;
  assert.equal(hasMoves(almost), true, 'a neighbour pair is still mergeable');
});

test('maxTile and tiles report the current contents', () => {
  const board = [
    [2, 0, 0, 0],
    [0, 8, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  assert.equal(maxTile(board), 8);
  assert.equal(tiles(board).length, 2);
  assert.deepEqual(tiles(board)[1], { r: 1, c: 1, value: 8 });
});

test('lineFor reads rows and columns in the right order', () => {
  const board = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  assert.deepEqual(lineFor(board, 'left', 0), [1, 2, 3, 4]);
  assert.deepEqual(lineFor(board, 'right', 0), [4, 3, 2, 1]);
  assert.deepEqual(lineFor(board, 'up', 0), [1, 5, 0, 0]);
  assert.deepEqual(lineFor(board, 'down', 0), [0, 0, 5, 1]);
});

test('writeLine is the inverse of lineFor for each direction', () => {
  const board = emptyBoard();
  writeLine(board, 'down', 1, [9, 8, 7, 6]);
  assert.deepEqual(lineFor(board, 'down', 1), [9, 8, 7, 6]);
  writeLine(board, 'right', 2, [4, 3, 2, 1]);
  assert.deepEqual(lineFor(board, 'right', 2), [4, 3, 2, 1]);
});
