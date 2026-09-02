/* The Node half of PDF reading: pdf.js's legacy build, which is the
   one that runs outside a browser. Everything that actually does
   work lives in lib/rows.mjs, so the CLI and the web app cannot
   drift apart in how they read a statement. */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readRowsWith } from "./lib/rows.mjs";

export { needsPassword, wrongPassword } from "./lib/rows.mjs";

export const readRows = (data, password) => readRowsWith(getDocument, data, password);
