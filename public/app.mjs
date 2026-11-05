import { createState, reducer, canUndo } from '/core/game.mjs';
import { slide } from '/core/board.mjs';

const grid = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const movesEl = document.getElementById('moves');
const undoBtn = document.getElementById('undo');
const newBtn = document.getElementById('new');
const banner = document.getElementById('banner');
const bannerTitle = document.getElementById('banner-title');
const bannerBody = document.getElementById('banner-body');
const bannerPrimary = document.getElementById('banner-primary');
const bannerSecondary = document.getElementById('banner-secondary');

const STORAGE_KEY = 'game2048.best';

let state = createState();
state.best = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
let gameId = makeGameId();

function makeGameId() {
  // crypto.randomUUID is unavailable on non-HTTPS remote hosts.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const scoreDialog = document.getElementById('score-dialog');
const leaderboardStatus = document.getElementById('leaderboard-status');
let candidate = null;

async function loadLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) throw new Error('Leaderboard unavailable.');
    const entries = await response.json();
    const list = document.getElementById('leaderboard-list');
    list.replaceChildren(...entries.map((entry) => {
      const item = document.createElement('li');
      const score = document.createElement('strong');
      score.textContent = entry.score.toLocaleString();
      item.append(document.createTextNode(entry.name), score);
      return item;
    }));
    leaderboardStatus.textContent = entries.length ? 'Best scores across all players.' : 'No scores yet. Be the first!';
  } catch {
    leaderboardStatus.textContent = 'Could not load leaderboard. Use Refresh to retry.';
  }
}

async function offerScore() {
  if (state.score <= 0) return;
  try {
    const response = await fetch(`/api/leaderboard/qualify?score=${state.score}&game_id=${gameId}`);
    if (!response.ok) throw new Error();
    if (!(await response.json()).qualifies) {
      leaderboardStatus.textContent = 'This score does not qualify, or has already been saved.';
      return;
    }
    candidate = { score: state.score, game_id: gameId };
    document.getElementById('qualifying-score').textContent = `Save your score of ${state.score.toLocaleString()}.`;
    document.getElementById('score-error').textContent = '';
    document.getElementById('player-name').value = localStorage.getItem('game2048.name') ?? '';
    scoreDialog.showModal();
    await new Promise((resolve) => scoreDialog.addEventListener('close', resolve, { once: true }));
  } catch {
    leaderboardStatus.textContent = 'Could not check your score. Submit current score to retry before starting a new game.';
    throw new Error('Leaderboard unavailable');
  }
}

document.getElementById('score-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('submit-score');
  const name = document.getElementById('player-name').value.trim();
  if (!name) {
    document.getElementById('score-error').textContent = 'Please enter your name.';
    return;
  }
  button.disabled = true;
  document.getElementById('skip-score').disabled = true;
  try {
    const response = await fetch('/api/leaderboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...candidate, name }),
    });
    if (!response.ok) throw new Error(response.status === 409
      ? 'This score no longer qualifies or was already saved. You can skip.'
      : 'Could not save your score. Please try again.');
    localStorage.setItem('game2048.name', name);
    scoreDialog.close();
    await loadLeaderboard();
  } catch (error) {
    document.getElementById('score-error').textContent = error.message;
  } finally {
    button.disabled = false;
    document.getElementById('skip-score').disabled = false;
  }
});
document.getElementById('skip-score').addEventListener('click', () => scoreDialog.close());
scoreDialog.addEventListener('cancel', (event) => {
  if (document.getElementById('submit-score').disabled) event.preventDefault();
});
document.getElementById('refresh-leaderboard').addEventListener('click', loadLeaderboard);
document.getElementById('save-score').addEventListener('click', () => dispatch({ type: 'submit-score' }));

// Background cells remain fixed; numbered tiles move independently above them.
const cells = Array.from({ length: 16 }, () => {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.setAttribute('role', 'gridcell');
  grid.append(cell);
  return cell;
});

let tiles = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function positionTile(tile, index) {
  const cell = cells[index];
  tile.style.width = `${cell.offsetWidth}px`;
  tile.style.height = `${cell.offsetHeight}px`;
  tile.style.transform = `translate(${cell.offsetLeft}px, ${cell.offsetTop}px)`;
}

function renderBoard(effects = false, merges = []) {
  for (const tile of tiles.values()) tile.remove();
  tiles = new Map();
  state.board.flat().forEach((value, index) => {
    cells[index].setAttribute('aria-label', value ? String(value) : 'Empty');
    if (!value) return;
    const tile = document.createElement('div');
    tile.textContent = String(value);
    const tier = value <= 2048 ? `tile-${value}` : 'tile-super';
    tile.className = `cell tile ${tier}`;
    tile.setAttribute('aria-hidden', 'true');
    grid.append(tile);
    positionTile(tile, index);
    tiles.set(index, tile);
    if (!effects || reducedMotion.matches) return;
    const merged = merges.some(({ r, c }) => r * 4 + c === index);
    const spawned = state.spawned && state.spawned.r * 4 + state.spawned.c === index;
    if (merged || spawned) {
      tile.animate(
        merged
          ? [{ scale: '1' }, { scale: '1.16', offset: 0.5 }, { scale: '1' }]
          : [{ scale: '0.3', opacity: 0 }, { scale: '1', opacity: 1 }],
        { duration: merged ? 160 : 140, easing: 'ease-out' },
      );
    }
  });
}

function render() {
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(state.best);
  movesEl.textContent = `${state.moves} move${state.moves === 1 ? '' : 's'}`;
  undoBtn.disabled = !canUndo(state);

  if (state.best > Number(localStorage.getItem(STORAGE_KEY) ?? 0)) {
    localStorage.setItem(STORAGE_KEY, String(state.best));
  }
}

function showBanner(kind) {
  banner.hidden = false;
  bannerSecondary.hidden = false;
  if (kind === 'won') {
    bannerTitle.textContent = 'You made 2048!';
    bannerBody.textContent = `Score ${state.score} in ${state.moves} moves.`;
    bannerPrimary.textContent = 'Keep going';
    bannerPrimary.dataset.action = 'continue';
    bannerSecondary.textContent = 'New game';
  } else {
    bannerTitle.textContent = 'No moves left';
    bannerBody.textContent = `Final score ${state.score} across ${state.moves} moves.`;
    bannerPrimary.textContent = 'Try again';
    bannerPrimary.dataset.action = 'restart';
    bannerSecondary.hidden = true;
  }
}

let busy = false;
const pending = [];

async function dispatch(action) {
  if (busy) {
    if (pending.length < 4) pending.push(action);
    return;
  }
  busy = true;
  try {
    if (action.type === 'submit-score') {
      await offerScore();
      return;
    }
    if (action.type === 'restart') {
      await offerScore();
      gameId = makeGameId();
    }
    const previousStatus = state.status;
    const previous = state;
    const next = reducer(state, action);
    let merges = [];
    if (action.type === 'move' && next.moves > previous.moves) {
      const movement = slide(previous.board, action.direction);
      merges = movement.merges;
      if (!reducedMotion.matches) {
        const animations = movement.movements.map(({ from, to }) => {
          const tile = tiles.get(from[0] * 4 + from[1]);
          const target = cells[to[0] * 4 + to[1]];
          return tile.animate(
            [{ transform: tile.style.transform },
              { transform: `translate(${target.offsetLeft}px, ${target.offsetTop}px)` }],
            { duration: 140, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
          );
        });
        await Promise.all(animations.map((animation) => animation.finished));
      }
    }
    state = next;

    // Best score should survive restarts, so carry it across a fresh state.
    if (action.type === 'restart') state.best = Math.max(previous.best, state.best);

    if (state.status === 'won' && previousStatus !== 'won') showBanner('won');
    if (state.status === 'over' && previousStatus !== 'over') showBanner('over');
    if (state.status === 'playing') banner.hidden = true;

    renderBoard(action.type === 'move' && next.moves > previous.moves, merges);
    render();
    if ((state.status === 'won' || state.status === 'over') && state.status !== previousStatus) {
      pending.length = 0;
      await offerScore();
    }
  } catch (error) {
    console.warn(error.message);
  } finally {
    busy = false;
    if (pending.length) void dispatch(pending.shift());
  }
}

const KEY_DIRECTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
};

window.addEventListener('keydown', (event) => {
  if (scoreDialog.open || event.target.closest('input, textarea, button, [contenteditable]')) return;
  const direction = KEY_DIRECTIONS[event.code];
  if (direction) {
    event.preventDefault();
    dispatch({ type: 'move', direction });
    return;
  }
  if (event.code === 'KeyU') dispatch({ type: 'undo' });
  if (event.code === 'KeyN') dispatch({ type: 'restart' });
});

newBtn.addEventListener('click', () => dispatch({ type: 'restart' }));
undoBtn.addEventListener('click', () => dispatch({ type: 'undo' }));
bannerPrimary.addEventListener('click', () => dispatch({ type: bannerPrimary.dataset.action }));
bannerSecondary.addEventListener('click', () => dispatch({ type: 'restart' }));

// Swipe support: track the dominant axis of a drag.
let touchStart = null;
grid.addEventListener('pointerdown', (event) => {
  touchStart = { x: event.clientX, y: event.clientY };
});
grid.addEventListener('pointerup', (event) => {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) dispatch({ type: 'move', direction: dx > 0 ? 'right' : 'left' });
  else dispatch({ type: 'move', direction: dy > 0 ? 'down' : 'up' });
});

new ResizeObserver(() => {
  for (const [index, tile] of tiles) positionTile(tile, index);
}).observe(grid);

renderBoard();
render();
void loadLeaderboard();
