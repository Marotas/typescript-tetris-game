import './style.css';
import {
  COLUMNS, ROWS, SHAPES, type Matrix, type Piece, type PieceType,
  clearLines, collides, createBoard, createPiece, dropDistance, dropInterval,
  levelForLines, mergePiece, scoreForLines, shuffledBag, tryRotate,
} from './game.ts';

const CELL = 30;

const COLORS: Record<PieceType, [string, string]> = {
  I: ['#39d8ef', '#1199c4'], O: ['#ffd166', '#e89a35'], T: ['#b78aff', '#8053d6'],
  S: ['#63e6a4', '#28aa78'], Z: ['#ff6b85', '#d83c65'], J: ['#5b9cff', '#3864d8'], L: ['#ffad61', '#e5773b'],
};

// Look-ups that throw instead of returning null, so the constants below are
// non-nullable inside every function (a top-level `if (!x) throw` doesn't narrow there).
function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The game UI is incomplete: missing ${selector}.`);
  return element;
}

function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable.');
  return ctx;
}

const gameCanvas = requireElement<HTMLCanvasElement>('#game-canvas');
const holdCanvas = requireElement<HTMLCanvasElement>('#hold-canvas');
const nextCanvas = requireElement<HTMLCanvasElement>('#next-canvas');
const overlay = requireElement<HTMLDivElement>('#overlay');
const overlayKicker = requireElement<HTMLSpanElement>('#overlay-kicker');
const overlayTitle = requireElement<HTMLElement>('#overlay-title');
const overlayCopy = requireElement<HTMLSpanElement>('#overlay-copy');
const overlayButton = requireElement<HTMLButtonElement>('#overlay-button');
const scoreElement = requireElement<HTMLElement>('#score');
const bestElement = requireElement<HTMLElement>('#best');
const levelElement = requireElement<HTMLElement>('#level');
const linesElement = requireElement<HTMLElement>('#lines');
const holdStatus = requireElement<HTMLElement>('#hold-status');

const context = require2d(gameCanvas);
const holdContext = require2d(holdCanvas);
const nextContext = require2d(nextCanvas);

let board = createBoard();
let bag: PieceType[] = [];
let upcoming: PieceType[] = [];
let active = createPiece(drawFromBag());
let held: PieceType | null = null;
let canHold = true;
let score = 0;
let lines = 0;
let level = 1;
let best = readBest();
let paused = false;
let gameOver = false;
let lastDrop = 0;
let animationFrame = 0;

function drawFromBag(): PieceType {
  if (bag.length === 0) bag.push(...shuffledBag());
  return bag.pop()!;
}

function collision(piece: Piece, dx = 0, dy = 0, matrix: Matrix = piece.matrix): boolean {
  return collides(board, piece, dx, dy, matrix);
}

function fillUpcoming(): void {
  while (upcoming.length < 6) upcoming.push(drawFromBag());
}

function spawnNext(): void {
  fillUpcoming();
  active = createPiece(upcoming.shift()!);
  fillUpcoming();
  canHold = true;
  holdStatus.textContent = 'SAVE FOR LATER';
  if (collision(active)) finishGame();
}

function rotateActive(): void {
  if (paused || gameOver) return;
  const rotated = tryRotate(board, active);
  if (rotated) active = rotated;
}

function move(dx: number, dy: number): boolean {
  if (paused || gameOver || collision(active, dx, dy)) return false;
  active.x += dx;
  active.y += dy;
  if (dy > 0) score += 1;
  return true;
}

function holdPiece(): void {
  if (paused || gameOver || !canHold) return;
  const currentType = active.type;
  if (held) {
    active = createPiece(held);
    held = currentType;
    if (collision(active)) finishGame();
  } else {
    held = currentType;
    spawnNext();
  }
  canHold = false;
  holdStatus.textContent = 'HOLD USED';
}

function hardDrop(): void {
  if (paused || gameOver) return;
  const distance = dropDistance(board, active);
  active.y += distance;
  score += distance * 2;
  lockPiece();
}

function lockPiece(): void {
  const result = clearLines(mergePiece(board, active));
  board = result.board;
  if (result.cleared > 0) {
    score += scoreForLines(result.cleared, level);
    lines += result.cleared;
    level = levelForLines(lines);
  }
  updateStats();
  spawnNext();
}

function finishGame(): void {
  gameOver = true;
  best = Math.max(best, score);
  try { localStorage.setItem('vector-blocks-best', String(best)); } catch { /* Storage can be unavailable in private browsing. */ }
  showOverlay('RUN COMPLETE', 'That was a good one.', 'Every great run starts with another.', 'PLAY AGAIN', restart);
  updateStats();
}

function readBest(): number {
  try {
    const saved = Number(localStorage.getItem('vector-blocks-best'));
    return Number.isFinite(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

function updateStats(): void {
  scoreElement.textContent = String(score).padStart(6, '0');
  bestElement.textContent = String(best).padStart(6, '0');
  levelElement.textContent = String(level).padStart(2, '0');
  linesElement.textContent = String(lines).padStart(2, '0');
}

function showOverlay(kicker: string, title: string, copy: string, buttonText: string, action: () => void): void {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  overlayButton.innerHTML = `${buttonText} <span>→</span>`;
  overlayButton.onclick = action;
  overlay.hidden = false;
}

function togglePause(): void {
  if (gameOver) return;
  paused = !paused;
  if (paused) showOverlay('TAKE A MOMENT', 'Take a breath.', 'Your stack will be right here.', 'RESUME GAME', togglePause);
  else overlay.hidden = true;
  lastDrop = performance.now();
}

function restart(): void {
  board = createBoard();
  bag = [];
  upcoming = [];
  held = null;
  canHold = true;
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  active = createPiece(drawFromBag());
  fillUpcoming();
  overlay.hidden = true;
  holdStatus.textContent = 'SAVE FOR LATER';
  lastDrop = performance.now();
  updateStats();
}

function paintBlock(ctx: CanvasRenderingContext2D, type: PieceType, x: number, y: number, size: number): void {
  const [light, dark] = COLORS[type];
  const inset = Math.max(1, size * 0.045);
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, light);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x + inset * 2, y + inset * 2, size - inset * 4, Math.max(1, size * 0.08));
  ctx.fillStyle = 'rgba(8,12,22,0.16)';
  ctx.fillRect(x + inset * 2, y + size - inset * 3, size - inset * 4, Math.max(1, size * 0.06));
}

function drawBoard(): void {
  context.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  context.fillStyle = '#0c101a';
  context.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  context.strokeStyle = 'rgba(145, 163, 194, 0.075)';
  context.lineWidth = 1;
  for (let x = 0; x <= COLUMNS; x++) {
    context.beginPath(); context.moveTo(x * CELL + 0.5, 0); context.lineTo(x * CELL + 0.5, gameCanvas.height); context.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    context.beginPath(); context.moveTo(0, y * CELL + 0.5); context.lineTo(gameCanvas.width, y * CELL + 0.5); context.stroke();
  }

  board.forEach((row, y) => row.forEach((type, x) => { if (type) paintBlock(context, type, x * CELL, y * CELL, CELL); }));

  if (!gameOver) {
    const ghostY = active.y + dropDistance(board, active);
    active.matrix.forEach((row, y) => row.forEach((value, x) => {
      if (!value || ghostY + y < 0) return;
      const px = (active.x + x) * CELL;
      const py = (ghostY + y) * CELL;
      context.strokeStyle = 'rgba(190, 204, 229, 0.32)';
      context.lineWidth = 1;
      context.strokeRect(px + 3.5, py + 3.5, CELL - 7, CELL - 7);
    }));
    active.matrix.forEach((row, y) => row.forEach((value, x) => {
      if (value) paintBlock(context, active.type, (active.x + x) * CELL, (active.y + y) * CELL, CELL);
    }));
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, types: (PieceType | null)[], slots: number): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#111622';
  ctx.fillRect(0, 0, width, height);
  const slotHeight = height / slots;

  types.slice(0, slots).forEach((type, index) => {
    if (!type) return;
    const matrix = SHAPES[type];
    const tile = Math.min(20, (width - 28) / Math.max(matrix[0].length, matrix.length));
    const shapeWidth = matrix[0].length * tile;
    const shapeHeight = matrix.length * tile;
    const startX = (width - shapeWidth) / 2;
    const startY = index * slotHeight + (slotHeight - shapeHeight) / 2;
    matrix.forEach((row, y) => row.forEach((value, x) => {
      if (value) paintBlock(ctx, type, startX + x * tile, startY + y * tile, tile);
    }));
    if (index > 0) {
      ctx.strokeStyle = 'rgba(145, 163, 194, 0.09)';
      ctx.beginPath(); ctx.moveTo(14, index * slotHeight); ctx.lineTo(width - 14, index * slotHeight); ctx.stroke();
    }
  });
}

function render(time: number): void {
  if (!paused && !gameOver) {
    const interval = dropInterval(level);
    if (time - lastDrop >= interval) {
      if (!move(0, 1)) lockPiece();
      lastDrop = time;
    }
  }
  drawBoard();
  drawPreview(holdContext, [held], 1);
  drawPreview(nextContext, upcoming.slice(0, 5), 5);
  animationFrame = requestAnimationFrame(render);
}

function handleKey(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' '].includes(key)) event.preventDefault();
  if (key === 'p' || key === 'escape') { togglePause(); return; }
  if (paused || gameOver) {
    if (key === 'enter' && gameOver) restart();
    return;
  }
  switch (key) {
    case 'arrowleft': case 'a': move(-1, 0); break;
    case 'arrowright': case 'd': move(1, 0); break;
    case 'arrowdown': case 's': move(0, 1); break;
    case 'arrowup': case 'x': case 'w': rotateActive(); break;
    case ' ': hardDrop(); break;
    case 'c': case 'shift': holdPiece(); break;
  }
}

window.addEventListener('keydown', handleKey);
document.querySelector('#restart-button')?.addEventListener('click', restart);
document.querySelector('[data-action="left"]')?.addEventListener('click', () => move(-1, 0));
document.querySelector('[data-action="right"]')?.addEventListener('click', () => move(1, 0));
document.querySelector('[data-action="down"]')?.addEventListener('click', () => move(0, 1));
document.querySelector('[data-action="rotate"]')?.addEventListener('click', rotateActive);
document.querySelector('[data-action="drop"]')?.addEventListener('click', hardDrop);
document.querySelector('[data-action="hold"]')?.addEventListener('click', holdPiece);

updateStats();
fillUpcoming();
lastDrop = performance.now();
animationFrame = requestAnimationFrame(render);

window.addEventListener('pagehide', () => cancelAnimationFrame(animationFrame));
