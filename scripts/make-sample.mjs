/* A synthetic statement in the layout the parser expects, so the
   whole browser path can be tested end to end without anybody's real
   one. Invented names and amounts throughout.

   Columns are LEFT-aligned under their headings, because that is how
   the real statement does it and how the parser matches: it takes the
   cell nearest each heading's x, and a right-aligned number starts at
   a different x than the heading above it. */

import { writeFileSync } from "node:fs";

const COLS = [0, 12, 52, 68, 82, 102, 120];
const HEAD = ["Date", "Narration", "Chq. / Ref No.", "Value Date", "Withdrawal Amount", "Deposit Amount", "Closing Balance"];

const line = (cells) => {
  let out = "";
  cells.forEach((cell, i) => {
    if (out.length < COLS[i]) out = out.padEnd(COLS[i]);
    out += String(cell ?? "") + " ";
  });
  return out.trimEnd();
};

const txns = [
  ["01/03/2026", "UPI-NETFLIX-NETFLIX.BD@HDFCBANK", "1001", "01/03/2026", "649.00", "0.00", "9,351.00"],
  ["03/03/2026", "UPI-BLINKIT-BLINKIT.PAYU@AXIS", "1002", "03/03/2026", "412.50", "0.00", "8,938.50"],
  ["05/03/2026", "UPI-MR ARJUN MALHOTRA-AR99@OKICICI", "1003", "05/03/2026", "0.00", "2,000.00", "10,938.50"],
  ["08/03/2026", "UPI-AUTOPAY-SPOTIFY-SPOT.BD@HDFC", "1004", "08/03/2026", "119.00", "0.00", "10,819.50"],
  ["11/03/2026", "UPI-CHAIWALA CORNER-PTMQR9@PAYTM", "1005", "11/03/2026", "60.00", "0.00", "10,759.50"],
  ["14/03/2026", "UPI-AIRTEL-AIRTEL.PAYU@AXISBANK", "1006", "14/03/2026", "399.00", "0.00", "10,360.50"],
  ["18/03/2026", "UPI-AMAZON-AMAZONUPI@APL-PAYING", "1007", "18/03/2026", "1,250.00", "0.00", "9,110.50"],
  ["22/03/2026", "UPI-BLINKIT-INSTAMART.REFUND@AXIS", "1008", "22/03/2026", "0.00", "412.50", "9,523.00"],
];

const debits = 649 + 412.5 + 119 + 60 + 399 + 1250;
const credits = 2000 + 412.5;
const opening = 10000;
const money = (n) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SUM_COLS = [0, 20, 34, 48, 66, 84];
const sumLine = (cells) => {
  let out = "";
  cells.forEach((cell, i) => {
    if (out.length < SUM_COLS[i]) out = out.padEnd(SUM_COLS[i]);
    out += String(cell) + " ";
  });
  return out.trimEnd();
};

const rows = [
  "Statement From : 01/03/26 TO : 31/03/26",
  "",
  line(HEAD),
  ...txns.map(line),
  "",
  "STATEMENT SUMMARY :-",
  sumLine(["Opening Balance", "Dr Count", "Cr Count", "Debits", "Credits", "Closing Balance"]),
  sumLine([money(opening), "6", "2", money(debits), money(credits), money(opening - debits + credits)]),
  "",
  "**END OF STATEMENT**",
];

writeFileSync("fixture.txt", rows.join("\n") + "\n");
console.log("wrote fixture.txt");
console.log(`  debits ${money(debits)}  credits ${money(credits)}  closing ${money(opening - debits + credits)}`);
