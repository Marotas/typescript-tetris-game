import { describe, expect, it } from 'vitest';
import {
  COLUMNS, PIECE_TYPES, ROWS, SHAPES, type Board, type PieceType,
  clearLines, collides, createBoard, createPiece, dropDistance, dropInterval,
  levelForLines, mergePiece, rotate, scoreForLines, shuffledBag, tryRotate,
} from './game.ts';

/** Board with the given rows (counted from the bottom) completely filled. */
function boardWithFullRows(...rowsFromBottom: number[]): Board {
  const board = createBoard();
  for (const r of rowsFromBottom) board[ROWS - 1 - r].fill('I');
  return board;
}

describe('createBoard', () => {
  it('is 20 rows by 10 columns and empty', () => {
    const board = createBoard();
    expect(board).toHaveLength(ROWS);
    board.forEach((row) => {
      expect(row).toHaveLength(COLUMNS);
      expect(row.every((cell) => cell === null)).toBe(true);
    });
  });

  it('does not share row arrays', () => {
    const board = createBoard();
    board[0][0] = 'T';
    expect(board[1][0]).toBeNull();
  });
});

describe('createPiece', () => {
  it.each(PIECE_TYPES)('spawns %s centred at the top', (type) => {
    const piece = createPiece(type);
    expect(piece.type).toBe(type);
    expect(piece.y).toBe(0);
    expect(piece.x).toBe(Math.floor((COLUMNS - SHAPES[type][0].length) / 2));
  });

  it('copies the shape so editing a piece never changes SHAPES', () => {
    const piece = createPiece('T');
    piece.matrix[0][0] = 9;
    expect(SHAPES.T[0][0]).toBe(0);
  });

  it('every shape has exactly 4 blocks', () => {
    for (const type of PIECE_TYPES) {
      expect(SHAPES[type].flat().filter(Boolean)).toHaveLength(4);
    }
  });
});

describe('rotate', () => {
  it('turns the I piece from horizontal to vertical', () => {
    expect(rotate(SHAPES.I)).toEqual([[1], [1], [1], [1]]);
  });

  it('rotates T clockwise', () => {
    expect(rotate(SHAPES.T)).toEqual([[1, 0], [1, 1], [1, 0]]);
  });

  it('returns to the original after four rotations', () => {
    for (const type of PIECE_TYPES) {
      let m = SHAPES[type];
      for (let i = 0; i < 4; i++) m = rotate(m);
      expect(m).toEqual(SHAPES[type]);
    }
  });

  it('leaves O unchanged', () => {
    expect(rotate(SHAPES.O)).toEqual(SHAPES.O);
  });
});

describe('collides', () => {
  const board = createBoard();

  it('is false for a freshly spawned piece', () => {
    for (const type of PIECE_TYPES) expect(collides(board, createPiece(type))).toBe(false);
  });

  it('detects the left and right walls', () => {
    const piece = { ...createPiece('O'), x: 0 };
    expect(collides(board, piece, -1, 0)).toBe(true);
    expect(collides(board, { ...piece, x: COLUMNS - 2 }, 1, 0)).toBe(true);
    expect(collides(board, { ...piece, x: COLUMNS - 2 })).toBe(false);
  });

  it('detects the floor', () => {
    const piece = { ...createPiece('O'), y: ROWS - 2 };
    expect(collides(board, piece)).toBe(false);
    expect(collides(board, piece, 0, 1)).toBe(true);
  });

  it('detects locked blocks', () => {
    const filled = createBoard();
    filled[5][4] = 'Z';
    const piece = { ...createPiece('O'), x: 4, y: 3 };
    expect(collides(filled, piece)).toBe(false);
    expect(collides(filled, piece, 0, 1)).toBe(true);
  });

  it('ignores empty cells of the matrix', () => {
    const filled = createBoard();
    filled[0][3] = 'Z'; // T's top-left cell is empty
    expect(collides(filled, { ...createPiece('T'), x: 3 })).toBe(false);
  });

  it('allows blocks above the top edge', () => {
    expect(collides(board, { ...createPiece('I'), y: -1 })).toBe(false);
  });
});

describe('tryRotate', () => {
  it('rotates in open space without moving', () => {
    const piece = { ...createPiece('T'), y: 5 };
    const rotated = tryRotate(createBoard(), piece);
    expect(rotated?.matrix).toEqual(rotate(SHAPES.T));
    expect(rotated?.x).toBe(piece.x);
  });

  it('kicks off the right wall', () => {
    // Vertical I three columns from the right: horizontal would stick out, so it must shift left.
    const piece = { type: 'I' as PieceType, matrix: rotate(SHAPES.I), x: COLUMNS - 3, y: 5 };
    const rotated = tryRotate(createBoard(), piece);
    expect(rotated).not.toBeNull();
    expect(rotated!.x).toBeLessThan(piece.x);
    expect(collides(createBoard(), rotated!)).toBe(false);
  });

  it('returns null when every kick collides', () => {
    const board = createBoard();
    board.forEach((row) => row.fill('Z'));
    for (let y = 5; y < 9; y++) board[y][4] = null; // a one-wide shaft
    const piece = { type: 'I' as PieceType, matrix: rotate(SHAPES.I), x: 4, y: 5 };
    expect(tryRotate(board, piece)).toBeNull();
  });

  it('does not mutate the original piece', () => {
    const piece = { ...createPiece('L'), y: 5 };
    const before = structuredClone(piece);
    tryRotate(createBoard(), piece);
    expect(piece).toEqual(before);
  });
});

describe('dropDistance', () => {
  it('falls to the floor on an empty board', () => {
    expect(dropDistance(createBoard(), createPiece('O'))).toBe(ROWS - 2);
  });

  it('stops on top of locked blocks', () => {
    const board = boardWithFullRows(0, 1, 2);
    expect(dropDistance(board, createPiece('O'))).toBe(ROWS - 2 - 3);
  });

  it('is 0 when already resting', () => {
    expect(dropDistance(createBoard(), { ...createPiece('I'), y: ROWS - 1 })).toBe(0);
  });
});

describe('mergePiece', () => {
  it('writes only the filled cells of the piece', () => {
    const piece = { ...createPiece('T'), x: 0, y: 0 };
    const board = mergePiece(createBoard(), piece);
    expect(board[0].slice(0, 3)).toEqual([null, 'T', null]);
    expect(board[1].slice(0, 3)).toEqual(['T', 'T', 'T']);
    expect(board.flat().filter(Boolean)).toHaveLength(4);
  });

  it('returns a new board and leaves the input untouched', () => {
    const original = createBoard();
    const merged = mergePiece(original, createPiece('O'));
    expect(merged).not.toBe(original);
    expect(original.flat().every((c) => c === null)).toBe(true);
  });

  it('drops cells above the top edge', () => {
    const board = mergePiece(createBoard(), { ...createPiece('O'), y: -1 });
    expect(board.flat().filter(Boolean)).toHaveLength(2);
  });
});

describe('clearLines', () => {
  it('clears nothing on an empty board', () => {
    const { board, cleared } = clearLines(createBoard());
    expect(cleared).toBe(0);
    expect(board).toHaveLength(ROWS);
  });

  it('clears a single full row', () => {
    expect(clearLines(boardWithFullRows(0)).cleared).toBe(1);
  });

  it('clears a Tetris (four rows)', () => {
    const { board, cleared } = clearLines(boardWithFullRows(0, 1, 2, 3));
    expect(cleared).toBe(4);
    expect(board.flat().every((c) => c === null)).toBe(true);
  });

  it('keeps partial rows and shifts them down', () => {
    const start = boardWithFullRows(0);
    start[ROWS - 2][0] = 'S'; // partial row sitting on top of the full one
    const { board, cleared } = clearLines(start);
    expect(cleared).toBe(1);
    expect(board).toHaveLength(ROWS);
    expect(board[ROWS - 1][0]).toBe('S');
    expect(board[ROWS - 2][0]).toBeNull();
  });

  it('clears non-adjacent full rows', () => {
    const start = boardWithFullRows(0, 2);
    start[ROWS - 2][5] = 'J';
    const { board, cleared } = clearLines(start);
    expect(cleared).toBe(2);
    expect(board[ROWS - 1][5]).toBe('J');
  });
});

describe('scoring and levels', () => {
  it.each([
    [0, 1, 0],
    [1, 1, 100],
    [2, 1, 300],
    [3, 1, 500],
    [4, 1, 800],
    [4, 3, 2400],
    [1, 5, 500],
  ])('%i lines at level %i scores %i', (cleared, level, expected) => {
    expect(scoreForLines(cleared, level)).toBe(expected);
  });

  it('caps the reward at the Tetris value', () => {
    expect(scoreForLines(5, 1)).toBe(800);
  });

  it.each([
    [0, 1], [9, 1], [10, 2], [19, 2], [25, 3], [100, 11],
  ])('%i lines is level %i', (lines, level) => {
    expect(levelForLines(lines)).toBe(level);
  });

  it('speeds up by 65 ms per level', () => {
    expect(dropInterval(1)).toBe(800);
    expect(dropInterval(2)).toBe(735);
  });

  it('never drops faster than 90 ms', () => {
    expect(dropInterval(12)).toBe(90);
    expect(dropInterval(50)).toBe(90);
  });
});

describe('shuffledBag', () => {
  it('contains each piece exactly once', () => {
    for (let i = 0; i < 20; i++) {
      expect([...shuffledBag()].sort()).toEqual([...PIECE_TYPES].sort());
    }
  });

  it('is deterministic for a given random source', () => {
    const seq = () => {
      let n = 0;
      return () => [0.1, 0.9, 0.5, 0.3, 0.7, 0.2][n++ % 6];
    };
    expect(shuffledBag(seq())).toEqual(shuffledBag(seq()));
  });

  it('keeps the original order when random always returns ~1', () => {
    expect(shuffledBag(() => 0.999)).toEqual([...PIECE_TYPES]);
  });
});
