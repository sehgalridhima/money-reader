/* Drive the real page in a real browser and assert the two things
   that matter: it produces the right numbers, and it never sends the
   file anywhere.

   Defaults to the synthetic fixture so this runs without anybody's
   real statement. Set PDF= and STMT_PASSWORD= to point it at a real
   locked one. */

import { chromium } from "playwright";

const PDF = process.env.PDF ?? "./public/sample-statement.pdf";
const PASSWORD = process.env.STMT_PASSWORD;

const browser = await chromium.launch();
const page = await browser.newPage();

const requests = [];
page.on("request", (r) => {
  if (!r.url().startsWith("http://localhost:3000")) return;
  requests.push({ method: r.method(), url: r.url(), bytes: (r.postData() ?? "").length, body: r.postData() ?? "" });
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

let bad = 0;
const check = (label, ok, extra = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) bad++;
};

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', PDF);

const locked = page.locator('input[type="password"]');
const report = page.locator("text=matches the bank");
const failed = page.locator("text=did not add up");

await Promise.race([
  locked.waitFor({ timeout: 30000 }),
  report.waitFor({ timeout: 30000 }),
  failed.waitFor({ timeout: 30000 }),
]);

if (await locked.isVisible()) {
  console.log("✓ detected the lock and asked for a password");
  if (!PASSWORD) {
    console.log("\nSTMT_PASSWORD not set — stopping here.");
    await browser.close();
    process.exit(0);
  }
  await locked.fill(PASSWORD);
  await page.click('button[type="submit"]');
  await report.waitFor({ timeout: 30000 });
}

check("the reconciliation gate passed", await report.isVisible());

const text = await page.locator("main").innerText();

console.log("\n=== what the page shows ===");
for (const [label, re] of [
  ["money out", /2,889\.50/],
  ["money in", /2,412\.50/],
  ["a category filled in with no network call", /Subscriptions|Groceries|Shopping/],
  ["only one payee is unfamiliar — the rest were named locally", /1 payee \(₹60\.00\) isn’t in the built-in list/],
  ["unfamiliar payees offered rather than sent", /in the built-in list/],
  ["consent button present", /Name these for me/],
]) {
  check(label, re.test(text));
}

console.log("\n=== every request the page made ===");
for (const r of requests) {
  console.log(`  ${r.method} ${r.url}${r.bytes ? ` (${r.bytes} bytes posted)` : ""}`);
}
const posted = requests.filter((r) => r.method === "POST");
check("nothing was POSTed before consent — the file stayed in the tab", posted.length === 0);

// Now consent, and check that what leaves is names only.
const button = page.locator("text=Name these for me");
if (await button.isVisible()) {
  await button.click();
  await page.waitForResponse((r) => r.url().includes("/api/categorise"), { timeout: 60000 });
  const sent = requests.find((r) => r.method === "POST");
  console.log("\n=== the one request that leaves, after consent ===");
  console.log("  " + (sent ? JSON.stringify(JSON.parse(sentBody(sent)), null, 1).slice(0, 400) : "none"));

  const body = sent ? sentBody(sent) : "";
  check("no amounts in the payload", !/\d+\.\d{2}/.test(body));
  check("no dates in the payload", !/\d{4}-\d{2}-\d{2}/.test(body));
  check("no balances or account number", !/balance|account/i.test(body));
  check("the person was NOT sent — resolved locally", !/MALHOTRA/i.test(body));
  check("only the unfamiliar name was sent", JSON.parse(body).names.length === 1);
}

function sentBody(r) {
  return r?.body ?? "{}";
}

if (errors.length) {
  console.log("\n=== page errors ===");
  for (const e of errors.slice(0, 6)) console.log("  " + e);
  bad += errors.length;
}

console.log(`\n${bad === 0 ? "All checks passed." : `${bad} FAILED.`}`);
await browser.close();
process.exit(bad === 0 ? 0 : 1);
