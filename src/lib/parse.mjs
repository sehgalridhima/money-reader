/* ===============================================================
   ROWS → TRANSACTIONS
   ===============================================================
   Nothing in this file is a judgement. Every number here is read off
   the page and added up in code, because a wrong total in a money
   tool is the worst kind of wrong: it looks like an answer, and
   nobody can tell it is not one.

   That is also why parse() ends by checking itself. HDFC prints its
   own totals at the foot of the statement — opening balance, number
   of debits and credits, the sum of each, closing balance. Those are
   not decoration: they are an independent answer to the same
   question. If what we added up disagrees with what the bank added
   up, the parse is wrong and must say so rather than quietly hand
   back a plausible number.
   =============================================================== */

/**
 * Money is held in paise, as a whole number.
 *
 * 0.1 + 0.2 is not 0.3 in binary floating point, and a statement is
 * hundreds of additions. Rupees as decimals would drift, slowly and
 * invisibly, in the one place nobody would think to check.
 */
export function toPaise(text) {
  const cleaned = String(text).replace(/[,\s₹]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const [rupees, decimals = ""] = cleaned.replace("-", "").split(".");
  const paise = Number(rupees) * 100 + Number(decimals.padEnd(2, "0"));
  return negative ? -paise : paise;
}

export const formatInr = (paise) =>
  `${paise < 0 ? "-" : ""}₹${Math.abs(Math.round(paise / 100)).toLocaleString("en-IN")}`;

/** Exact rupees, for anywhere the paise matter. */
export const formatExact = (paise) => {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}₹${Math.floor(abs / 100).toLocaleString("en-IN")}.${String(abs % 100).padStart(2, "0")}`;
};

const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Column positions, learned from the statement's own header row.
 *
 * Hardcoding x=508 for "Withdrawal" would work until HDFC nudged its
 * layout by three points, and then it would silently read the wrong
 * column — debits appearing as credits, which is the single most
 * dangerous failure this parser has. Reading the header means the
 * statement tells us where its columns are.
 */
const COLUMNS = [
  { key: "date", match: /^date$/i },
  { key: "narration", match: /^narration$/i },
  { key: "ref", match: /^chq/i },
  { key: "valueDate", match: /^value/i },
  { key: "debit", match: /^withdrawal/i },
  { key: "credit", match: /^deposit/i },
  { key: "balance", match: /^closing/i },
];

function findColumns(rows) {
  for (const row of rows) {
    const text = row.text.toLowerCase();
    if (!text.includes("narration") || !text.includes("withdrawal")) continue;

    const found = {};
    for (const cell of row.cells) {
      for (const { key, match } of COLUMNS) {
        if (match.test(cell.text.trim())) found[key] ??= cell.x;
      }
    }
    if (found.date != null && found.debit != null && found.credit != null) {
      return { columns: found, headerY: row.y };
    }
  }
  return null;
}

/** The cell nearest this column, if anything is near enough to count. */
function cellAt(row, x, tolerance = 40) {
  let best = null;
  for (const cell of row.cells) {
    const distance = Math.abs(cell.x - x);
    if (distance <= tolerance && (!best || distance < best.distance)) {
      best = { distance, text: cell.text };
    }
  }
  return best?.text ?? null;
}

/**
 * Everything printed in one column, not just the nearest fragment.
 *
 * Whether a line of text arrives as one cell or several is the PDF
 * writer's choice, and banks differ. Taking only the nearest cell —
 * which is what this did first — turned "MR ARJUN MALHOTRA" into
 * "MR" and "CHAIWALA CORNER" into "CHAIWALA" on a statement whose
 * writer emitted each word separately. Both were wrong in a way that
 * still looked like a name, which is the kind of wrong nobody checks.
 *
 * So: take every cell that falls between this column and the next,
 * left to right. Where the writer emitted one cell, that is exactly
 * what it was before.
 */
function cellsIn(row, from, until, tolerance = 20) {
  return row.cells
    .filter((c) => c.x >= from - tolerance && (until == null || c.x < until - tolerance))
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * One page of transactions.
 *
 * A transaction is anchored by its date. Its narration is longer than
 * one printed line, so the bank breaks it into fixed-width pieces and
 * prints them on the rows above and below — sometimes on the anchor
 * row itself. Each loose piece is given to whichever anchor it is
 * closest to, which is what the eye does when reading the page.
 *
 * The pieces are joined with NO separator. They are one string cut at
 * a fixed width, not words: "...RZPAP@A" + "XISBANK..." is
 * "...RZPAP@AXISBANK...". Joining with a space would corrupt every
 * merchant name in the file.
 */
function parsePage(rows) {
  const header = findColumns(rows);
  if (!header) return { transactions: [], summary: null };

  const { columns } = header;

  const body = [];
  let summaryRow = null;
  let inSummary = false;

  for (const row of rows) {
    if (row.y >= header.headerY) continue;
    if (/statement summary/i.test(row.text)) {
      inSummary = true;
      continue;
    }
    if (inSummary) {
      // The row of six numbers under the summary's own headings.
      const numbers = row.cells.map((c) => toPaise(c.text)).filter((n) => n !== null);
      if (numbers.length === 6 && !summaryRow) summaryRow = numbers;
      continue;
    }
    body.push(row);
  }

  const anchors = [];
  for (const row of body) {
    const date = cellAt(row, columns.date, 30);
    if (date && DATE.test(date.trim())) anchors.push(row);
  }

  const pieces = new Map(anchors.map((a) => [a.y, []]));

  /*
   * The narration runs from its own column up to whichever column
   * comes next — the reference number on most statements, or the
   * amounts where there is none.
   */
  const afterNarration = [columns.ref, columns.valueDate, columns.debit]
    .filter((x) => x != null && x > columns.narration)
    .sort((a, b) => a - b)[0];

  for (const row of body) {
    const text = cellsIn(row, columns.narration, afterNarration);
    if (!text) continue;

    // Whichever anchor this line is printed nearest to.
    let nearest = null;
    for (const anchor of anchors) {
      const distance = Math.abs(anchor.y - row.y);
      if (!nearest || distance < nearest.distance) nearest = { distance, y: anchor.y };
    }
    if (nearest) pieces.get(nearest.y).push({ y: row.y, text });
  }

  const transactions = [];

  for (const anchor of anchors) {
    const [, dd, mm, yyyy] = cellAt(anchor, columns.date, 30).trim().match(DATE);
    const debit = toPaise(cellAt(anchor, columns.debit, 50) ?? "0");
    const credit = toPaise(cellAt(anchor, columns.credit, 50) ?? "0");
    const balance = toPaise(cellAt(anchor, columns.balance, 50) ?? "");

    const narration = pieces
      .get(anchor.y)
      .sort((a, b) => b.y - a.y) // down the page, which is reading order
      .map((p) => p.text)
      .join("");

    transactions.push({
      date: `${yyyy}-${mm}-${dd}`,
      narration,
      ref: cellAt(anchor, columns.ref, 60) ?? "",
      debit: debit ?? 0,
      credit: credit ?? 0,
      balance,
    });
  }

  const summary = summaryRow
    ? {
        opening: summaryRow[0],
        debitCount: Math.round(summaryRow[1] / 100),
        creditCount: Math.round(summaryRow[2] / 100),
        debits: summaryRow[3],
        credits: summaryRow[4],
        closing: summaryRow[5],
      }
    : null;

  return { transactions, summary };
}

/**
 * Every transaction in the statement, with the bank's own totals and
 * a verdict on whether ours agree with them.
 */
export function parse(pages) {
  const transactions = [];
  let summary = null;

  for (const rows of pages) {
    const page = parsePage(rows);
    transactions.push(...page.transactions);
    summary ??= page.summary;
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const totals = {
    debits: transactions.reduce((n, t) => n + t.debit, 0),
    credits: transactions.reduce((n, t) => n + t.credit, 0),
    debitCount: transactions.filter((t) => t.debit > 0).length,
    creditCount: transactions.filter((t) => t.credit > 0).length,
  };

  return { transactions, summary, totals, check: reconcile(totals, summary) };
}

/**
 * Do our totals match the bank's?
 *
 * Every mismatch here is a real defect — a transaction missed, a
 * column misread, a number parsed wrong. There is no acceptable
 * rounding difference, because both sides are whole paise.
 */
function reconcile(totals, summary) {
  if (!summary) {
    return {
      ok: false,
      reason: "This statement has no summary block to check against.",
      problems: [],
    };
  }

  const problems = [];
  const compare = (label, ours, theirs) => {
    if (ours !== theirs) {
      problems.push(`${label}: we read ${formatExact(ours)}, the bank says ${formatExact(theirs)}`);
    }
  };

  compare("Total out", totals.debits, summary.debits);
  compare("Total in", totals.credits, summary.credits);

  if (totals.debitCount !== summary.debitCount) {
    problems.push(
      `Debit count: we found ${totals.debitCount}, the bank says ${summary.debitCount}`,
    );
  }
  if (totals.creditCount !== summary.creditCount) {
    problems.push(
      `Credit count: we found ${totals.creditCount}, the bank says ${summary.creditCount}`,
    );
  }

  // The balance has to walk: what you started with, plus in, minus
  // out, is what you ended with. This catches a transaction read
  // twice, which the totals alone might not.
  const walked = summary.opening + summary.credits - summary.debits;
  if (walked !== summary.closing) {
    problems.push(
      `The bank's own figures do not balance: ${formatExact(summary.opening)} + ${formatExact(summary.credits)} - ${formatExact(summary.debits)} is ${formatExact(walked)}, not ${formatExact(summary.closing)}`,
    );
  }

  return { ok: problems.length === 0, problems };
}
