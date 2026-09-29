export type SplitTile = { row: number; column: number; x: number; y: number; width: number; height: number };

export function calculateSplitTiles(width: number, height: number, rows: number, columns: number): SplitTile[] {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) throw new Error("Image dimensions must be positive integers.");
  if (!Number.isInteger(rows) || rows < 1 || rows > 12 || !Number.isInteger(columns) || columns < 1 || columns > 12) throw new Error("Rows and columns must be whole numbers from 1 to 12.");
  const tiles: SplitTile[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = Math.floor(width * column / columns), y = Math.floor(height * row / rows);
    const x2 = Math.floor(width * (column + 1) / columns), y2 = Math.floor(height * (row + 1) / rows);
    tiles.push({ row, column, x, y, width: Math.max(1, x2 - x), height: Math.max(1, y2 - y) });
  }
  return tiles;
}
