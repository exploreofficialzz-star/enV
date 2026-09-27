declare module "qrcode" {
  type QRColor = { dark?: string; light?: string };
  type QROptions = {
    width?: number;
    margin?: number;
    color?: QRColor;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  };

  export function toDataURL(text: string, options?: QROptions): Promise<string>;
  export function toString(text: string, options: QROptions & { type: "svg" }): Promise<string>;
}
