/* ===============================================================
   PDF → ROWS
   ===============================================================
   A bank statement is a table. A PDF does not know that — it knows
   only that some text was drawn at some coordinates. So this does
   not "read" a statement. It puts every scrap of text back into the
   row it was printed on, using its y position, and leaves the
   understanding to the caller.

   Nothing here interprets a number. That is the point: this is the
   one place where a misplaced decimal would be both invisible and
   permanent.
   =============================================================== */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Two items are on the same printed row when their baselines are
 * within this many points of each other.
 *
 * Exact equality is wrong: a row containing two font sizes has two
 * slightly different baselines, and splitting there would tear a
 * transaction in half — the date in one row, the amount in another.
 */
const ROW_TOLERANCE = 3;

/**
 * Every page as a list of rows, each row as its cells left to right.
 *
 * Throws PasswordException when the file is encrypted and the
 * password is missing or wrong; see needsPassword and wrongPassword.
 */
export async function readRows(data, password) {
  const doc = await getDocument({
    data,
    password,
    // A statement is text. Fonts and images are weight we never read.
    disableFontFace: true,
    isEvalSupported: false,
    /*
     * Silence. Without this pdf.js prints
     *   "Warning: UnknownErrorException: Ensure that the
     *    standardFontDataUrl API parameter is provided"
     * once per embedded font — harmless, since we want the characters
     * and not their shapes, but it reads as a stack of errors on a
     * run that in fact succeeded. It stopped a working parse from
     * being believed, which is a real cost for a cosmetic problem.
     */
    verbosity: 0,
  }).promise;

  const pages = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    const rows = [];

    for (const item of content.items) {
      if (!item.str.trim()) continue;

      // transform is [a,b,c,d,e,f]; e and f are x and y on the page.
      const x = item.transform[4];
      const y = item.transform[5];

      const row = rows.find((r) => Math.abs(r.y - y) <= ROW_TOLERANCE);
      if (row) row.items.push({ x, str: item.str });
      else rows.push({ y, items: [{ x, str: item.str }] });
    }

    // Top of the page down, and within a row left to right — which is
    // the order a person reads them, and the order the columns are in.
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) row.items.sort((a, b) => a.x - b.x);

    pages.push(
      rows.map((row) => ({
        y: Math.round(row.y),
        cells: row.items.map((i) => ({ x: Math.round(i.x), text: i.str })),
        text: row.items
          .map((i) => i.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      })),
    );
  }

  return { pages, numPages: doc.numPages };
}

export const needsPassword = (e) =>
  e?.name === "PasswordException" && /no password/i.test(e.message ?? "");

export const wrongPassword = (e) =>
  e?.name === "PasswordException" && !needsPassword(e);
