// Pure game rules: no DOM, no canvas, no globals. Everything here is unit-tested.

export const COLUMNS = 10;
export const ROWS = 20;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Matrix = number[][];
export type Piece = { type: PieceType; matrix: Matrix; x: number; y: number };
export type Board = (PieceType | null)[][];

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const SHAPES: Record<PieceType, Matrix> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

/** Points for clearing 0–4 lines at once, before the level multiplier. */
export const LINE_REWARDS = [0, 100, 300, 500, 800] as const;

/** Wall-kick offsets tried, in order, when a rotation collides. */
export const KICK_OFFSETS = [0, -1, 1, -2, 2] as const;

export function createRow(): (PieceType | null)[] {
  return Array<PieceType | null>(COLUMNS).fill(null);
}

export function createBoard(): Board {
  return Array.from({ length: ROWS }, createRow);
}

/** A fresh piece of the given type, centred horizontally at the top. */
export function createPiece(type: PieceType): Piece {
  const matrix = SHAPES[type].map((row) => [...row]);
  return { type, matrix, x: Math.floor((COLUMNS - matrix[0].length) / 2), y: 0 };
}

/** True if the piece, shifted by (dx, dy) and using `matrix`, overlaps a wall, the floor or a locked block. */
export function collides(board: Board, piece: Piece, dx = 0, dy = 0, matrix: Matrix = piece.matrix): boolean {
  return matrix.some((row, rowIndex) => row.some((value, columnIndex) => {
    if (!value) return false;
    const x = piece.x + columnIndex + dx;
    const y = piece.y + rowIndex + dy;
    return x < 0 || x >= COLUMNS || y >= ROWS || (y >= 0 && board[y][x] !== null);
  }));
}

/** Rotates a matrix 90° clockwise. */
export function rotate(matrix: Matrix): Matrix {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]).reverse());
}

/**
 * Rotates the piece clockwise, trying the wall-kick offsets in order.
 * Returns the rotated piece, or null if every offset collides.
 */
export function tryRotate(board: Board, piece: Piece): Piece | null {
  const rotated = rotate(piece.matrix);
  for (const offset of KICK_OFFSETS) {
    if (!collides(board, piece, offset, 0, rotated)) {
      return { ...piece, matrix: rotated, x: piece.x + offset };
    }
  }
  return null;
}

/** How many rows the piece can fall before it lands. */
export function dropDistance(board: Board, piece: Piece): number {
  let distance = 0;
  while (!collides(board, piece, 0, distance + 1)) distance++;
  return distance;
}

/** Returns a new board with the piece's blocks written in. Cells above the top edge are dropped. */
export function mergePiece(board: Board, piece: Piece): Board {
  const next = board.map((row) => [...row]);
  piece.matrix.forEach((row, y) => row.forEach((value, x) => {
    const boardY = piece.y + y;
    if (value && boardY >= 0) next[boardY][piece.x + x] = piece.type;
  }));
  return next;
}

/** Removes full rows, adds empty rows on top, and reports how many were cleared. */
export function clearLines(board: Board): { board: Board; cleared: number } {
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - remaining.length;
  while (remaining.length < ROWS) remaining.unshift(createRow());
  return { board: remaining, cleared };
}

/** Points awarded for clearing `cleared` lines at `level`. */
export function scoreForLines(cleared: number, level: number): number {
  if (cleared <= 0) return 0;
  return (LINE_REWARDS[cleared] ?? LINE_REWARDS[4]) * level;
}

/** Level is 1 for 0–9 lines, 2 for 10–19, and so on. */
export function levelForLines(lines: number): number {
  return Math.floor(lines / 10) + 1;
}

/** Milliseconds between automatic drops at a given level, never faster than 90 ms. */
export function dropInterval(level: number): number {
  return Math.max(90, 800 - (level - 1) * 65);
}

/** A shuffled "7-bag": each piece type exactly once. `random` is injectable for tests. */
export function shuffledBag(random: () => number = Math.random): PieceType[] {
  const types = [...PIECE_TYPES];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types;
}
