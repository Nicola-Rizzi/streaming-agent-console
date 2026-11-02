// gifenc ships without types; only what record.demo.ts uses.
declare module "gifenc" {
  type Palette = number[][];
  const gifenc: {
    quantize(rgba: Uint8Array, maxColors: number): Palette;
    applyPalette(rgba: Uint8Array, palette: Palette): Uint8Array;
    GIFEncoder(): {
      writeFrame(index: Uint8Array, width: number, height: number, options: { palette: Palette; delay: number }): void;
      finish(): void;
      bytes(): Uint8Array;
    };
  };
  export default gifenc;
}
