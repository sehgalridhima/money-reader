/* ===============================================================
   THE REPORT
   ===============================================================
   Run:  npm start

   Opens the statement, checks what it read against the bank's own
   printed totals, and only then says where the money went.

   The check comes FIRST and refuses to print anything that failed
   it. A money tool that is confidently wrong is worse than one that
   admits it could not read the file: the second sends you to look at
   the PDF, the first sends you to make a decision.
   =============================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { readRows, needsPassword, wrongPassword } from "./src/pdf.mjs";
import { openWithPassword } from "./src/ask.mjs";
import { parse, formatExact } from "./src/parse.mjs";
import { analyse } from "./src/analyse.mjs";
import { categorise, estimateCostInr } from "./src/categorise.mjs";

const FILE = process.argv[2] ?? "./statement.pdf";

const { pages } = await openWithPassword({
  read: readRows,
  bytes: () => new Uint8Array(readFileSync(FILE)),
  needsPassword,
  wrongPassword,
  hint: [
    "Banks commonly use one of these, with no spaces:",
    "  - date of birth as DDMMYYYY   (01021999)",
    "  - PAN in capitals             (ABCDE1234F)",
    "  - first 4 letters of your name + DDMM",
  ].join("\n"),
});

const { transactions, summary, totals, check } = parse(pages);

const bar = (n = 62) => "-".repeat(n);
const head = (title) => `\n${title}\n${bar()}`;
const rupees = (paise) => formatExact(paise).padStart(12);

if (!transactions.length) {
  console.error("\nNo transactions found. This statement's layout may differ");
  console.error("from the one this was built for. Run `npm run inspect` and");
  console.error("look at rows.txt to see how its columns are arranged.");
  process.exit(1);
}

/*
 * The gate. Everything below is only worth printing because our
 * arithmetic and the bank's agree to the paisa.
 */
if (!check.ok) {
  console.error(head("THIS STATEMENT DID NOT ADD UP"));
  console.error("\nWhat was read does not match the totals printed on the");
  console.error("statement itself, so the figures below would be wrong in");
  console.error("ways you could not see. Nothing else is shown.\n");
  for (const problem of check.problems) console.error(`  - ${problem}`);
  console.error("\nThe PDF is untouched. This is a bug in the reader.");
  process.exit(1);
}

const a = analyse(transactions);

console.log(head("STATEMENT"));
console.log(`  ${a.period.from} to ${a.period.to}  (${a.period.days} days)`);
console.log("  Checked against the bank's own totals: they agree exactly.");

console.log(head("THE SHORT VERSION"));
console.log(`  Money in          ${rupees(a.moneyIn)}   (${totals.creditCount} credits)`);
if (a.refundTotal > 0) {
  console.log(`    of which income ${rupees(a.realIncome)}`);
  console.log(`    of which refund ${rupees(a.refundTotal)}   money coming back, not earned`);
}
console.log(`  Money out         ${rupees(a.moneyOut)}   (${totals.debitCount} debits)`);
console.log(`  Net               ${rupees(a.net)}   ${a.net >= 0 ? "kept" : "overspent"}`);
console.log(`  Closing balance   ${rupees(summary.closing)}`);

if (a.recurring.length) {
  console.log(head("REPEATING PAYMENTS"));
  for (const r of a.recurring) {
    console.log(`  ${r.name}`);
    console.log(`    about ${formatExact(r.typical)} each · ${formatExact(r.total)} this period`);
    console.log(`    ${r.evidence}`);
  }
  if (a.recurring.some((r) => !r.certain)) {
    console.log("\n  Only the AUTOPAY ones are certain — the bank records those");
    console.log("  as standing instructions. The rest are inferred from the");
    console.log("  pattern, so check before cancelling anything.");
  }
}

/*
 * Categories are asked for AFTER everything above is already true.
 * If this call fails, is skipped, or has no API key, the report loses
 * a section and keeps every number.
 */
const spendingNames = a.byMerchant.map((m) => m.name);

/*
 * The note the payer wrote, where there is one. It disambiguates what
 * the company name alone cannot — "EURONET SERVICES IND" is an ATM
 * operator, but its note here reads GPAYRECHARGE2 and the payment was
 * a phone recharge. Notes carry no amounts, so this stays inside the
 * same line: names and words, never money.
 */
const GENERIC = /^(upi|upiintent|payment|collect|pay|na|null)$/i;

const hints = {};
for (const group of [...a.byMerchant, ...a.incomeBySource]) {
  // From the group, not from raw transactions: a group's display name
  // is one of its spellings ("LAZY PAY" vs "LAZYPAY"), and a hint filed
  // under the other spelling would never be looked up.
  const useful = (s) => s && s.length < 40 && !GENERIC.test(s);
  const bits = [];
  for (const t of group.transactions) {
    if (useful(t.handle)) bits.push(t.handle);
    if (useful(t.note)) bits.push(t.note);
  }
  const hint = [...new Set(bits)].slice(0, 2).join(", ");
  if (hint) hints[group.name] = hint;
}

const { categories, asked, usage, missingKey } = await categorise(
  [...spendingNames, ...a.incomeBySource.map((m) => m.name)],
  { hints },
);

if (Object.keys(categories).length) {
  const totals = new Map();
  let unlabelled = 0;

  for (const m of a.byMerchant) {
    const hit = categories[m.name];
    if (!hit) {
      unlabelled += m.total;
      continue;
    }
    const group = totals.get(hit.category) ?? { total: 0, names: [], unsure: false };
    group.total += m.total;
    group.names.push(m.name);
    if (!hit.sure) group.unsure = true;
    totals.set(hit.category, group);
  }

  console.log(head("WHAT YOU SPENT IT ON"));
  const ranked = [...totals.entries()].sort((x, y) => y[1].total - x[1].total);
  for (const [name, group] of ranked) {
    const share = Math.round((group.total / a.moneyOut) * 100);
    console.log(
      `  ${rupees(group.total)}  ${String(share).padStart(3)}%  ${name}${group.unsure ? " *" : ""}`,
    );
    console.log(`${" ".repeat(21)}${group.names.slice(0, 4).join(", ")}`);
  }
  if (unlabelled > 0) {
    console.log(`  ${rupees(unlabelled)}         (not categorised)`);
  }
  if (ranked.some(([, g]) => g.unsure)) {
    console.log("\n  * contains a name that could be several things — the");
    console.log("    category there is a guess, unlike every figure above it.");
  }
}

console.log(head("WHERE IT WENT"));
for (const m of a.byMerchant.slice(0, 12)) {
  const share = Math.round((m.total / a.moneyOut) * 100);
  const label = categories[m.name]?.category;
  console.log(
    `  ${rupees(m.total)}  ${String(share).padStart(3)}%  ${m.name} (${m.count})${label ? `  · ${label}` : ""}`,
  );
}

console.log(head("WHERE IT CAME FROM"));
for (const m of a.incomeBySource) {
  console.log(`  ${rupees(m.total)}         ${m.name} (${m.count})`);
}

if (a.refunds.length) {
  console.log(head("REFUNDS — counted separately, this is not income"));
  for (const r of a.refunds) {
    console.log(`  ${rupees(r.credit)}  ${r.date}  ${r.merchant ?? ""}`);
  }
}

console.log(head("BIGGEST SINGLE PAYMENTS"));
for (const t of a.largest) {
  console.log(`  ${rupees(t.debit)}  ${t.date}  ${t.merchant ?? t.narration.slice(0, 40)}`);
}

console.log(head("EVERY TRANSACTION"));
for (const t of a.transactions) {
  const amount = t.debit > 0 ? `-${formatExact(t.debit)}` : `+${formatExact(t.credit)}`;
  console.log(
    `  ${t.date}  ${amount.padStart(12)}  ${(t.merchant ?? "?").slice(0, 28).padEnd(28)} ${t.isAutopay ? "AUTOPAY" : ""}`,
  );
}

console.log(`\n${bar()}`);
console.log("Every figure above was added up from the statement, never");
console.log("estimated. Only the category labels are a judgement — and the");
console.log("model that made them was sent the payee names alone: no");
console.log("amounts, no dates, no balances, no account number.");
if (missingKey) {
  console.log("\nNo ANTHROPIC_API_KEY set, so categories were skipped. Every");
  console.log("number above is unaffected — they are counted, not asked for.");
} else if (asked > 0) {
  console.log(`\n${asked} new payee${asked === 1 ? "" : "s"} looked up, about Rs ${estimateCostInr(usage).toFixed(2)}.`);
  console.log("Saved to categories.json, so next month only asks about names");
  console.log("it has not seen before.");
}
console.log("");

writeFileSync(
  "report.json",
  JSON.stringify(
    {
      period: a.period,
      moneyIn: a.moneyIn,
      moneyOut: a.moneyOut,
      net: a.net,
      closingBalance: summary.closing,
      recurring: a.recurring,
      byMerchant: a.byMerchant.map(({ transactions: _, ...m }) => m),
    },
    null,
    2,
  ),
);
console.log("Also written to report.json.\n");
