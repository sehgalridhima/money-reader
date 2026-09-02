/* ===============================================================
   WHAT DOES THIS STATEMENT ACTUALLY LOOK LIKE?
   ===============================================================
   Run:  npm run inspect

   Every bank lays its statement out differently, so a parser cannot
   be written until one real file has been looked at. This prints the
   layout of yours — where the columns sit, which rows are
   transactions and which are headers — and writes it to rows.txt.

   THE PASSWORD IS NEVER STORED AND NEVER PRINTED. It is read from
   the terminal with the echo muted, used to open the file, and
   dropped when the process exits. Nothing writes it to disk, so
   there is no file to forget about later.
   =============================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { readRows, needsPassword, wrongPassword } from "./src/pdf.mjs";

const FILE = process.argv[2] ?? "./statement.pdf";

/** How many times to let a mistyped password be retried. */
const ATTEMPTS = 3;

/**
 * Ask for something without echoing it back.
 *
 * The first version redrew the prompt on every keystroke to paint
 * over the typed character. It printed its escape codes as literal
 * text instead — "[2K[200DPassword:" — which reads exactly like a
 * crash. It cost a round trip to find out the password had been fine
 * all along, so: never make a prompt look like an error.
 *
 * Raw mode with the characters collected by hand is the version that
 * works on a real terminal. Readline's own muting still emits cursor
 * codes, which is what produced the mess in the first place.
 */
/*
 * One reader for the whole run, not one per question. A fresh
 * readline interface per call consumed the stream and left the second
 * attempt waiting forever — which only showed up when a test piped
 * three wrong passwords in.
 */
let pipedLines = null;

function askHidden(question) {
  const stdin = process.stdin;

  // Piped input, as in a test. No terminal, so nothing to hide from.
  if (!stdin.isTTY) {
    pipedLines ??= createInterface({ input: stdin, terminal: false })[
      Symbol.asyncIterator
    ]();
    return pipedLines.next().then((r) => (r.done ? "" : r.value.trim()));
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let typed = "";

    const done = (value, code) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (code !== undefined) process.exit(code);
      resolve(value);
    };

    const onData = (char) => {
      switch (char) {
        case "\r":
        case "\n":
          return done(typed.trim());
        // Ctrl-C. Raw mode swallows it, so it has to be handled here
        // or the prompt becomes impossible to escape.
        case "\u0003":
          return done("", 130);
        case "\u007f":
        case "\b":
          typed = typed.slice(0, -1);
          return;
        default:
          typed += char;
      }
    };

    stdin.on("data", onData);
  });
}

/** A fresh copy each time: pdf.js consumes the buffer it is handed. */
const bytes = () => new Uint8Array(readFileSync(FILE));

let result;
try {
  result = await readRows(bytes());
} catch (error) {
  if (!needsPassword(error)) throw error;

  console.log("\nThis statement is password protected.");
  console.log("Banks commonly use one of these, with no spaces:");
  console.log("  - date of birth as DDMMYYYY   (01021999)");
  console.log("  - PAN in capitals             (ABCDE1234F)");
  console.log("  - first 4 letters of your name + DDMM");
  console.log("The covering email usually says which one.");
  console.log("\nNothing will appear as you type. That is deliberate.\n");

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const password = await askHidden("Password: ");

    if (!password) {
      console.log("Nothing entered.\n");
      continue;
    }

    try {
      result = await readRows(bytes(), password);
      break;
    } catch (retry) {
      if (!wrongPassword(retry)) throw retry;
      const left = ATTEMPTS - attempt;
      console.log(
        left > 0
          ? `That did not open it. ${left} more ${left === 1 ? "try" : "tries"}.\n`
          : "That did not open it.",
      );
    }
  }

  if (!result) {
    console.error("\nStopped without opening the file. Nothing was changed,");
    console.error("and the PDF itself is untouched. Run it again when you");
    console.error("have the right password — there is no lockout here.");
    process.exit(1);
  }
}

const lines = [];
lines.push(`file: ${FILE}`);
lines.push(`pages: ${result.numPages}`);

result.pages.forEach((rows, i) => {
  lines.push(`\n${"=".repeat(70)}\nPAGE ${i + 1} — ${rows.length} rows\n${"=".repeat(70)}`);
  for (const row of rows) {
    // The x positions are what reveal the columns, so keep them.
    const cols = row.cells.map((c) => `${c.x}:${c.text}`).join(" | ");
    lines.push(`y=${String(row.y).padStart(4)}  ${cols}`);
  }
});

const out = lines.join("\n");
writeFileSync("rows.txt", out);

console.log(`\nOpened. ${result.numPages} page(s), ${result.pages.flat().length} rows.`);
console.log(`Layout written to rows.txt (${(out.length / 1024).toFixed(0)} KB).`);
console.log("\nFirst few rows:\n");
console.log(
  result.pages[0]
    .slice(0, 10)
    .map((r) => "  " + r.text.slice(0, 90))
    .join("\n"),
);
