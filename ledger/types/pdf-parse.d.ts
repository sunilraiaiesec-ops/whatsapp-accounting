declare module "pdf-parse" {
  type PdfData = {
    text: string;
    numpages: number;
  };

  export default function pdf(dataBuffer: Buffer): Promise<PdfData>;
}
