declare module "qrcode" {
  type QRColor = { dark?: string; light?: string };
  type QROptions = { width?: number; margin?: number; color?: QRColor };

  export function toDataURL(text: string, options?: QROptions): Promise<string>;
}
