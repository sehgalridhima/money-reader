/* ===============================================================
   MERCHANTS WE ALREADY KNOW
   ===============================================================
   Most of an Indian bank statement is the same two dozen companies.
   Nobody needs a language model to be told that Swiggy is food or
   that Airtel is a phone bill, so those are answered here: instantly,
   for free, and without a single byte leaving the browser.

   The model is for the tail — the local restaurant, the tuition
   centre, the name you do not recognise — and on a typical statement
   that tail is three or four names rather than fifteen. This list is
   what makes the API call optional instead of required, which is the
   difference between "you may send some names" and "you must".

   Matched against the normalised merchant key (see merchant.mjs),
   which is upper-case with spaces and company suffixes removed. So
   "SWIGGY LIMITED", "Swiggy Ltd" and "SWIGGY" all arrive as SWIGGY.
   =============================================================== */

export const KNOWN = {
  "Food & dining": [
    "SWIGGY", "ZOMATO", "EATSURE", "FAASOS", "BEHROUZ", "OVENSTORY", "BOX8",
    "DOMINOS", "PIZZAHUT", "MCDONALDS", "KFC", "BURGERKING", "SUBWAY",
    "STARBUCKS", "CCD", "CAFECOFFEEDAY", "CHAIPOINT", "CHAAYOS", "THIRDWAVE",
    "HALDIRAMS", "BIKANERVALA", "BARBEQUENATION", "SOCIAL", "WOWMOMO",
    "DUNKIN", "BASKINROBBINS", "NATURALSICECREAM", "THEOBROMA", "DUNZODAILY",
  ],
  Groceries: [
    "BLINKIT", "GROFERS", "ZEPTO", "SWIGGYINSTAMART", "INSTAMART", "BIGBASKET",
    "DMART", "AVENUESUPERMARTS", "RELIANCEFRESH", "RELIANCESMART", "MORERETAIL",
    "SPENCERS", "NATURESBASKET", "LICIOUS", "FRESHTOHOME", "COUNTRYDELIGHT",
    "MILKBASKET", "OTIPY", "JIOMART",
  ],
  Shopping: [
    "AMAZON", "AMAZONINDIA", "FLIPKART", "MYNTRA", "AJIO", "NYKAA", "MEESHO",
    "SNAPDEAL", "TATACLIQ", "SHOPPERSSTOP", "LIFESTYLE", "PANTALOONS", "MAX",
    "WESTSIDE", "DECATHLON", "IKEA", "CROMA", "RELIANCEDIGITAL", "VIJAYSALES",
    "APPLE", "ONEPLUS", "MI", "XIAOMI", "SAMSUNG", "BOAT", "FIRSTCRY", "PEPPERFRY",
  ],
  Transport: [
    "UBER", "OLA", "OLACABS", "RAPIDO", "BLUSMART", "MERU", "IRCTC", "INDIANRAILWAY",
    "REDBUS", "ABHIBUS", "INDIGO", "AIRINDIA", "VISTARA", "SPICEJET", "AKASAAIR",
    "MAKEMYTRIP", "GOIBIBO", "CLEARTRIP", "EASEMYTRIP", "YATRA", "IOCL",
    "BHARATPETROLEUM", "HPCL", "SHELL", "FASTAG", "PAYTMFASTAG", "NHAI", "DMRC",
    "METRO", "YULU", "BOUNCE", "VOGO",
  ],
  "Bills & utilities": [
    "AIRTEL", "JIO", "RELIANCEJIO", "VI", "VODAFONE", "IDEA", "BSNL", "MTNL",
    "ACT", "ACTFIBERNET", "HATHWAY", "TIKONA", "EXCITEL", "TATAPLAY", "TATASKY",
    "DISHTV", "D2H", "BSES", "BSESRAJDHANI", "BSESYAMUNA", "TATAPOWER", "ADANIELECTRICITY",
    "MSEDCL", "TORRENTPOWER", "INDRAPRASTHAGAS", "MAHANAGARGAS", "GUJARATGAS",
    "INDANE", "HPGAS", "BHARATGAS", "DELHIJALBOARD",
  ],
  Subscriptions: [
    "NETFLIX", "PRIMEVIDEO", "AMAZONPRIME", "HOTSTAR", "DISNEYHOTSTAR", "JIOHOTSTAR",
    "SONYLIV", "ZEE5", "VOOT", "JIOCINEMA", "AHA", "MUBI", "APPLETV",
    "SPOTIFY", "GAANA", "WYNK", "JIOSAAVN", "YOUTUBEPREMIUM", "GOOGLEONE",
    "ICLOUD", "DROPBOX", "ADOBE", "MICROSOFT", "OPENAI", "ANTHROPIC", "NOTION",
    "CANVA", "FIGMA", "GITHUB", "AUDIBLE", "KINDLEUNLIMITED",
  ],
  Health: [
    "APOLLO", "APOLLOPHARMACY", "PHARMEASY", "NETMEDS", "TATA1MG", "1MG",
    "MEDPLUS", "WELLNESSFOREVER", "PRACTO", "CULTFIT", "CUREFIT", "FITTERNITY",
    "THYROCARE", "DRLALPATHLABS", "METROPOLIS", "REDCLIFFELABS", "MAXHEALTHCARE",
    "FORTIS", "MANIPAL", "NARAYANAHEALTH",
  ],
  Education: [
    "COURSERA", "UDEMY", "EDX", "UPGRAD", "SIMPLILEARN", "GREATLEARNING",
    "SCALER", "NEWTONSCHOOL", "CODINGNINJAS", "GEEKSFORGEEKS", "LEETCODE",
    "BYJUS", "UNACADEMY", "VEDANTU", "PHYSICSWALLAH", "TOPPR", "KHANACADEMY",
    "DUOLINGO", "LAWSIKHO", "INTERNSHALA", "UDACITY", "DATACAMP", "PLURALSIGHT",
  ],
  Entertainment: [
    "BOOKMYSHOW", "PVR", "INOX", "CINEPOLIS", "PAYTMINSIDER", "DISTRICT",
    "STEAM", "PLAYSTATION", "XBOX", "NINTENDO", "GOOGLEPLAY", "APPSTORE",
    "DREAM11", "MPL", "RUMMYCIRCLE",
  ],
  "Credit & loans": [
    "LAZYPAY", "SIMPL", "SLICE", "UNI", "ZESTMONEY", "KREDITBEE", "MONEYVIEW",
    "CASHE", "PAYSENSE", "NAVI", "BAJAJFINSERV", "BAJAJFINANCE", "HDFCCARD",
    "ICICICARD", "SBICARD", "AXISCARD", "ONECARD", "CRED", "PAYTMPOSTPAID",
  ],
  "Fees & charges": [
    "SMSCHARGES", "AMBCHARGES", "ATMCHARGES", "GST", "SERVICECHARGE",
    "ANNUALFEE", "LATEFEE", "PENALTY", "NACHRETURN", "CHEQUERETURN",
  ],
  Income: [
    "SALARY", "PAYROLL", "INTERESTPAID", "INTERESTCREDIT", "DIVIDEND", "REFUNDIT",
    "INCOMETAXREFUND", "CASHBACK",
  ],
  Investments: [
    "ZERODHA", "GROWW", "UPSTOX", "ANGELONE", "KUVERA", "COINDCX", "WAZIRX",
    "INDMONEY", "SMALLCASE", "PAYTMMONEY", "ETMONEY", "NPS", "PPF",
  ],
};

/** Category → the keys that mean it, flattened for lookup. */
const INDEX = new Map();
for (const [category, keys] of Object.entries(KNOWN)) {
  for (const key of keys) INDEX.set(key, category);
}

/**
 * The category for a merchant key, if this list already knows it.
 *
 * Tries an exact match first, then a prefix match — bank narrations
 * append all sorts of noise ("SWIGGYINSTAMARTPRI"), and a merchant
 * that starts with a name we know is almost always that merchant.
 * The minimum length stops "MI" from claiming half the alphabet.
 */
export function lookupKnown(key) {
  if (!key) return null;

  const exact = INDEX.get(key);
  if (exact) return exact;

  for (const [known, category] of INDEX) {
    if (known.length >= 5 && key.startsWith(known)) return category;
  }
  return null;
}

/** Every category name the app can show, in a sensible reading order. */
export const CATEGORIES = [
  ...Object.keys(KNOWN),
  "Transfers to people",
  "Cash & ATM",
  "Other",
];
