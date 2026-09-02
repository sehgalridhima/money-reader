/* ===============================================================
   CATEGORISING WITHOUT ASKING ANYONE
   ===============================================================
   Two rules, run in the browser, that between them handle most of a
   statement:

     1. A name we already know     → known-merchants.mjs
     2. A name that is a *person*  → a transfer, not a purchase

   What is left over is the genuinely unfamiliar tail, and only that
   is ever offered to the model. On the statement this was built
   against, these two rules answer eleven of fourteen payees for
   free, which turns the API call from a requirement into a choice.
   =============================================================== */

import { lookupKnown } from "./known-merchants.mjs";

/** MS, MR, SHRI, SMT — a strong signal the payee is a person. */
const HONORIFIC = /^(MR|MRS|MS|MISS|SHRI|SHRIMATI|SMT|DR|PROF|SH)\b/i;

/*
 * Words that mean an organisation. A name containing one of these is
 * not a person however much it looks like one — "PATEL BROTHERS
 * TRADERS" is a shop and "SHARMA MEDICAL STORE" is a chemist.
 */
const ORGANISATION =
  /\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CORP|CO|COMPANY|ENTERPRISES?|TRADERS?|STORES?|STORE|SHOP|MART|BAZAAR|BAZAR|SERVICES?|SOLUTIONS?|TECHNOLOG|SYSTEMS?|INDUSTRIES|AGENCIES|AGENCY|CENTRE|CENTER|CLINIC|HOSPITAL|MEDICAL|PHARMA|RESTAURANT|CAFE|HOTEL|DHABA|SWEETS|FOODS?|KITCHEN|CATERERS?|BROTHERS|SONS|ASSOCIATES|CONSULTANC|ACADEMY|INSTITUTE|SCHOOL|COLLEGE|UNIVERSITY|BANK|FINANCE|CAPITAL|INSURANCE|TELECOM|ENERGY|POWER|GAS|MOTORS?|AUTOMOBILE|SALON|SPA|GYM|FITNESS|LABS?|DIAGNOSTIC)\b/i;

/*
 * Common Indian surnames. Not a complete list and cannot be one —
 * it is a *shortcut*, and its only job is to answer the easy cases
 * without a network call. A name it does not recognise falls through
 * to the model, which is the correct outcome rather than a failure.
 */
const SURNAMES = new Set(
  `SHARMA VERMA GUPTA AGARWAL AGRAWAL SEHGAL SEGAL MEHTA MALHOTRA KAPOOR CHOPRA
   KHANNA ARORA BHATIA SAXENA SRIVASTAVA MISHRA TIWARI PANDEY DUBEY TRIPATHI
   CHATURVEDI JOSHI BHATT DESAI PATEL SHAH MODI THAKKAR PARIKH TRIVEDI VYAS
   IYER IYENGAR NAIR MENON PILLAI KRISHNAN SUBRAMANIAN RAMAN NARAYANAN RAO
   REDDY NAIDU CHOWDARY PRASAD SINGH KAUR GILL SIDHU DHILLON SANDHU BRAR
   BAJWA GREWAL CHEEMA RANDHAWA BEDI SODHI AHLUWALIA WALIA CHADHA ANAND
   BANERJEE CHATTERJEE MUKHERJEE GHOSH BOSE DUTTA SEN DAS ROY SARKAR
   BHATTACHARYA CHAKRABORTY MAJUMDAR KHAN AHMED AHMAD ALI HUSSAIN SHAIKH
   SHEIKH ANSARI QURESHI SIDDIQUI RIZVI MIRZA PATHAN SYED FAROOQUI USMANI
   KULKARNI DESHMUKH PATIL JADHAV SHINDE GAIKWAD MORE PAWAR SAWANT BHOSALE
   KAMBLE CHAVAN THAKUR YADAV KUMAR LAL CHAND RAM DEVI BAI
   FERNANDES DSOUZA DSILVA PEREIRA RODRIGUES GOMES PINTO LOBO SALDANHA
   JAIN BANSAL GOYAL GOEL MITTAL JINDAL SINGHAL AGGARWAL KHURANA SETHI
   NANDA GROVER TANEJA MADAN SOOD SURI BHASIN DHAWAN SACHDEVA WADHWA`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Does this read as a person's name rather than a business?
 *
 * Deliberately conservative, and the first version was not. It
 * accepted any two plain words, which turned small eateries — the
 * ones named "<owner>'s <dish>", which is most of them — into people
 * being sent money. Confidently wrong, and not the kind of wrong
 * anyone reading the report would think to question.
 *
 * So the bar is now an honorific, or a recognised surname in last
 * position, which is where Indian names put it. "NEERU SEHGAL"
 * passes; "BASHA MOMOS" does not and goes to the model instead.
 * Sending a name that did not need to go is the cheaper mistake.
 */
export function looksLikePerson(name) {
  if (!name) return false;

  const cleaned = name.trim().replace(/\s+/g, " ");
  if (ORGANISATION.test(cleaned)) return false;
  if (/\d/.test(cleaned)) return false;

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((w) => /^[A-Za-z][A-Za-z'.-]{0,15}$/.test(w))) return false;

  // An honorific is close to conclusive on its own.
  if (HONORIFIC.test(cleaned)) return true;

  return SURNAMES.has(words.at(-1).toUpperCase().replace(/[^A-Z]/g, ""));
}

/**
 * A category for a payee, or null if nobody here can say.
 *
 * `from` records how the answer was reached, because the reader
 * deserves to know which labels are lookups and which are opinions:
 * "list" and "shape" never left the browser, "model" did.
 */
export function classifyLocally(name, key) {
  const known = lookupKnown(key);
  if (known) return { category: known, from: "list", sure: true };

  if (looksLikePerson(name)) {
    return { category: "Transfers to people", from: "shape", sure: true };
  }

  return null;
}

/** The payees nothing local could name — the only ones worth asking about. */
export function unresolved(groups) {
  return groups.filter((g) => !classifyLocally(g.name, g.key)).map((g) => g.name);
}
