declare module "jsqr" {
  interface QRCodePoint { x: number; y: number }
  interface QRCode {
    binaryData: number[];
    data: string;
    chunks: unknown[];
    version: number;
    location: {
      topRightCorner: QRCodePoint;
      topLeftCorner: QRCodePoint;
      bottomRightCorner: QRCodePoint;
      bottomLeftCorner: QRCodePoint;
      topRightFinderPattern: QRCodePoint;
      topLeftFinderPattern: QRCodePoint;
      bottomLeftFinderPattern: QRCodePoint;
      bottomRightAlignmentPattern?: QRCodePoint;
    };
  }
  interface Options { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }
  function jsQR(data: Uint8ClampedArray, width: number, height: number, options?: Options): QRCode | null;
  export default jsQR;
}
