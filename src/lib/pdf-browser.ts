/* ===============================================================
   READING THE PDF IN THE BROWSER
   ===============================================================
   This file is the reason the site can promise that your statement
   is never uploaded. pdf.js was built to run in a browser, and every
   sum in this project is plain arithmetic, so there is nothing the
   server needs to be given. The file is read from the user's disk
   into their own tab's memory and stays there.

   That is not a privacy feature bolted on afterwards. It is the
   cheapest possible architecture that also happens to be the safest
   one — there is no upload endpoint to secure, no file to store, no
   retention policy to write, and no breach to have.
   =============================================================== */

import { readRowsWith, needsPassword, wrongPassword } from "./rows.mjs";

export { needsPassword, wrongPassword };

/*
 * pdf.js does its parsing in a worker so the page stays responsive.
 * Loaded from the copy in node_modules via a URL Next resolves at
 * build time — not from a CDN, because a script fetched from someone
 * else's server is a script that could be swapped for one that
 * uploads what it reads.
 */
let getDocument: ((opts: Record<string, unknown>) => { promise: Promise<PdfDocument> }) | null = null;

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<unknown> }>;
};

export type Cell = { x: number; text: string };
export type Row = { y: number; cells: Cell[]; text: string };

async function loadPdfJs() {
  if (getDocument) return getDocument;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  getDocument = pdfjs.getDocument as unknown as typeof getDocument;
  return getDocument!;
}

/**
 * Rows of text from a file the user picked, without it leaving the tab.
 *
 * Throws pdf.js's PasswordException when the file is locked — the
 * caller decides how to ask, because in a browser that is a form
 * field rather than a terminal prompt.
 */
export async function readRowsInBrowser(
  file: ArrayBuffer,
  password?: string,
): Promise<{ pages: Row[][]; numPages: number }> {
  const load = await loadPdfJs();
  /*
   * A fresh view every time: pdf.js takes ownership of the buffer it
   * is handed and neuters it, so a retry with the right password
   * would otherwise be handed zero bytes.
   */
  return readRowsWith(load as never, new Uint8Array(file.slice(0)), password) as Promise<{
    pages: Row[][];
    numPages: number;
  }>;
}
