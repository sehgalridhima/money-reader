/* ===============================================================
   ASKING FOR A PASSWORD
   ===============================================================
   Read from the terminal, never echoed, never written down. It lives
   in a variable for as long as it takes to open the PDF and goes
   when the process does.

   The first attempt at this redrew the prompt on each keystroke to
   paint over the character just typed. It emitted its escape codes
   as literal text — "[2K[200DPassword:" — which reads exactly like a
   crash, and a working run was abandoned because of it. Readline's
   own muting has the same problem: it writes cursor-control codes
   that a plain terminal shows raw.

   So: raw mode, characters collected by hand, nothing echoed at all.
   =============================================================== */

import { createInterface } from "node:readline";

const ENTER = ["\r", "\n"];
const CTRL_C = "\u0003";
const BACKSPACE = ["\u007f", "\b"];

let pipedLines = null;

export function askHidden(question) {
  const stdin = process.stdin;

  /*
   * Piped input, as in a test. There is no terminal to hide from, and
   * one shared reader for the whole run — a fresh interface per call
   * consumes the stream and leaves the second question waiting for a
   * line that will never arrive.
   */
  if (!stdin.isTTY) {
    pipedLines ??= createInterface({ input: stdin, terminal: false })[Symbol.asyncIterator]();
    return pipedLines.next().then((r) => (r.done ? "" : r.value.trim()));
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let typed = "";

    const finish = (value, exitCode) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (exitCode !== undefined) process.exit(exitCode);
      resolve(value);
    };

    const onData = (char) => {
      if (ENTER.includes(char)) return finish(typed.trim());
      // Raw mode swallows Ctrl-C, so without this the prompt cannot
      // be escaped and the only way out is closing the window.
      if (char === CTRL_C) return finish("", 130);
      if (BACKSPACE.includes(char)) {
        typed = typed.slice(0, -1);
        return;
      }
      typed += char;
    };

    stdin.on("data", onData);
  });
}

/**
 * Open a PDF, asking for the password only if it turns out to need
 * one, and allowing for the fact that people mistype.
 *
 * `read` is called with (bytes, password) and is expected to throw
 * the way pdf.js does. Nothing here inspects what comes back.
 */
export async function openWithPassword({ read, bytes, needsPassword, wrongPassword, attempts = 3, hint }) {
  try {
    return await read(bytes());
  } catch (error) {
    if (!needsPassword(error)) throw error;

    console.log("\nThis statement is password protected.");
    if (hint) console.log(hint);
    console.log("\nNothing will appear as you type. That is deliberate.\n");

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const password = await askHidden("Password: ");

      if (!password) {
        console.log("Nothing entered.\n");
        continue;
      }

      try {
        // A fresh copy each time: pdf.js consumes the buffer it gets.
        return await read(bytes(), password);
      } catch (retry) {
        if (!wrongPassword(retry)) throw retry;
        const left = attempts - attempt;
        console.log(
          left > 0
            ? `That did not open it. ${left} more ${left === 1 ? "try" : "tries"}.\n`
            : "That did not open it.",
        );
      }
    }

    console.error("\nStopped without opening the file. The PDF is untouched,");
    console.error("nothing was changed, and there is no lockout — run it");
    console.error("again whenever you have the right password.");
    process.exit(1);
  }
}
