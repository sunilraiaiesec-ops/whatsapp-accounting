declare module "pdf-parse/lib/pdf-parse.js" {
  function pdf(dataBuffer: Buffer): Promise<{ text: string; numpages: number }>;
  export = pdf;
}
