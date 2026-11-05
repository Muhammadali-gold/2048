import test from 'node:test';
import assert from 'node:assert/strict';
import { slide } from '../src/core/board.mjs';

for (const direction of ['left', 'right', 'up', 'down']) {
  test(`movement metadata reconstructs the slid board: ${direction}`, () => {
    const board = [[2, 0, 2, 4], [4, 4, 8, 0], [0, 2, 0, 2], [2, 2, 4, 4]];
    const result = slide(board, direction);
    const reconstructed = Array.from({ length: 4 }, () => Array(4).fill(0));
    for (const { from, to, value } of result.movements) {
      assert.equal(board[from[0]][from[1]], value);
      reconstructed[to[0]][to[1]] += value;
    }
    assert.deepEqual(reconstructed, result.board);
    assert.equal(result.movements.length, board.flat().filter(Boolean).length);
  });
}

test('merging tiles share destinations without chain merging', () => {
  const result = slide([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left');
  assert.deepEqual(result.movements.map(({ to }) => to), [[0, 0], [0, 0], [0, 1], [0, 1]]);
  assert.deepEqual(result.merges, [{ r: 0, c: 0, value: 4 }, { r: 0, c: 1, value: 4 }]);
});
