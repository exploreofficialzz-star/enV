// PDF.js ships one declaration file for its public display API. Reuse that
// API typing for the equivalent legacy ESM bundle, which includes compatibility
// polyfills for runtimes that do not implement every modern Promise helper.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
