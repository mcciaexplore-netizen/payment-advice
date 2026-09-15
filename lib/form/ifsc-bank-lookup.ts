/**
 * Static, offline lookup of Indian bank IFSC prefixes -> bank names.
 *
 * An IFSC code is always 11 characters: the first 4 are alphabetic and
 * identify the bank (the same 4 letters for every branch of that bank),
 * the 5th is always "0", and the last 6 identify the branch. This table
 * only needs the first 4 characters, so Bank Name can be derived entirely
 * offline — no network call, no latency, no dependency on a third-party
 * service staying up during a live submission.
 *
 * Sourced from razorpay/ifsc (github.com/razorpay/ifsc,
 * src/banknames.json), an actively-maintained open dataset generated from
 * NPCI's own bank master data — cross-checked against known major banks
 * before inclusion here. Trimmed from that project's ~1,500 entries (which
 * also lists hundreds of small local cooperative banks) down to roughly
 * 150-200 covering every major Scheduled Commercial Bank, Small Finance
 * Bank, Payments Bank, well-known foreign bank operating in India, and the
 * handful of cooperative banks large enough to be genuinely common
 * payees — matching this app's actual use case (vendor/payee bank
 * accounts), not an exhaustive registry of every local co-operative
 * society. A handful of legacy codes for banks since merged into a larger
 * one (e.g. Vijaya Bank, Dena Bank -> Bank of Baroda) are deliberately kept:
 * those IFSCs can still appear on an existing account/cheque even though
 * the bank no longer exists as a separate entity.
 *
 * Correcting or extending this list later automatically applies
 * everywhere it's used (the Bank Name auto-fill and the vendor
 * bank-account picker) — nothing to backfill, since it's derived at
 * render/fill time, never stored.
 */
export const IFSC_BANK_NAMES: Record<string, string> = {
  // Public Sector Banks (current, post-2020 mergers)
  SBIN: "State Bank of India",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  BKID: "Bank of India",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  IOBA: "Indian Overseas Bank",
  CBIN: "Central Bank of India",
  IDIB: "Indian Bank",
  UCBA: "UCO Bank",
  MAHB: "Bank of Maharashtra",
  PSIB: "Punjab & Sind Bank",

  // Public Sector Banks merged away, codes may still exist on older accounts
  SBBJ: "State Bank of Bikaner and Jaipur",
  SBHY: "State Bank of Hyderabad",
  SBMY: "State Bank of Mysore",
  SBTR: "State Bank of Travancore",
  STBP: "State Bank of Patiala",
  VIJB: "Vijaya Bank",
  BKDN: "Dena Bank",
  CORP: "Corporation Bank",
  ANDB: "Andhra Bank",
  SYNB: "Syndicate Bank",
  ALLA: "Allahabad Bank",
  ORBC: "Oriental Bank of Commerce",
  UTBI: "United Bank of India",
  LAVB: "Laxmi Vilas Bank",

  // Private Sector Banks
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  INDB: "IndusInd Bank",
  YESB: "Yes Bank",
  IDFB: "IDFC FIRST Bank",
  FDRL: "Federal Bank",
  SIBL: "South Indian Bank",
  KVBL: "Karur Vysya Bank",
  CIUB: "City Union Bank",
  RATN: "RBL Bank",
  BDBL: "Bandhan Bank",
  CSBK: "Catholic Syrian Bank",
  TMBL: "Tamilnad Mercantile Bank",
  DLXB: "Dhanlaxmi Bank",
  KARB: "Karnataka Bank",
  JAKA: "Jammu and Kashmir Bank",
  DCBL: "DCB Bank",
  NTBL: "Nainital Bank",
  DBSS: "DBS Bank",

  // Small Finance Banks
  AUBL: "AU Small Finance Bank",
  ESFB: "Equitas Small Finance Bank",
  UJVN: "Ujjivan Small Finance Bank",
  JSFB: "Jana Small Finance Bank",
  SURY: "Suryoday Small Finance Bank",
  NESF: "North East Small Finance Bank",
  UTKS: "Utkarsh Small Finance Bank",
  FSFB: "Fincare Small Finance Bank",
  CLBL: "Capital Small Finance Bank",
  SHIX: "Shivalik Small Finance Bank",
  SMCB: "Shivalik Small Finance Bank",
  UNBA: "Unity Small Finance Bank",

  // Payments Banks
  AIRP: "Airtel Payments Bank",
  PYTM: "Paytm Payments Bank",
  FINO: "Fino Payments Bank",
  NSPB: "NSDL Payments Bank",
  IPOS: "India Post Payments Bank",
  IPPB: "India Post Payments Bank",
  JIOP: "Jio Payments Bank",
  ABPB: "Aditya Birla Idea Payments Bank",

  // Foreign Banks operating in India
  CITI: "Citibank",
  HSBC: "Hongkong & Shanghai Banking Corporation",
  SCBL: "Standard Chartered Bank",
  DEUT: "Deutsche Bank",
  BOFA: "Bank of America",
  ABNA: "Royal Bank of Scotland",
  ADCB: "Abu Dhabi Commercial Bank",
  BARC: "Barclays Bank",
  BNPA: "BNP Paribas",
  MSHQ: "Mashreq Bank",
  SOGE: "Societe Generale",
  RABO: "Rabobank International",
  SMBC: "Sumitomo Mitsui Banking Corporation",
  BOTM: "MUFG Bank",
  NOSC: "Bank of Nova Scotia",
  ICBK: "Industrial and Commercial Bank of China",
  IBKO: "Industrial Bank of Korea",
  SHBK: "Shinhan Bank",
  HVBK: "Woori Bank",
  DOHB: "Doha Bank",
  QNBA: "Qatar National Bank",
  BCEY: "Bank of Ceylon",
  SBLD: "Sonali Bank",
  KRTH: "Krungthai Bank",
  EBIL: "Emirates NBD Bank",
  STCB: "SBM Bank",
  MHCB: "Mizuho Bank",
  CTCB: "Chinatrust Commercial Bank",
  ABBL: "AB Bank",
  CTBA: "Commonwealth Bank of Australia",
  IBBK: "PT Bank Maybank Indonesia",
  KBKB: "Kookmin Bank",
  NATA: "National Australia Bank",
  UOVB: "United Overseas Bank",

  // Cooperative banks large/well-known enough to appear as genuine payees
  // (weighted toward Maharashtra/Pune, matching this app's actual vendor base)
  SRCB: "Saraswat Co-operative Bank",
  SVCB: "SVC Co-operative Bank",
  COSB: "Cosmos Co-operative Bank",
  TJSB: "TJSB Sahakari Bank",
  NKGS: "NKGSB Co-operative Bank",
  ABHY: "Abhyudaya Co-operative Bank",
  PMCB: "Punjab & Maharashtra Co-operative Bank",
  BCBM: "Bharat Co-operative Bank",
  MCBL: "Mahanagar Co-operative Bank",
  JSBP: "Janata Sahakari Bank (Pune)",
  JJSB: "Jalgaon Janata Bank",
  KJSB: "Kalyan Janata Sahakari Bank",
  SJSB: "Solapur Janata Sahakari Bank",
  VASJ: "Vasai Janata Sahakari Bank",
  BACB: "Bassein Catholic Co-operative Bank",
  ZCBL: "Zoroastrian Co-operative Bank",
  RNSB: "Rajkot Nagarik Sahakari Bank",
  VARA: "Varachha Co-operative Bank",
  MSCI: "Maharashtra State Co-operative Bank",
  GSCB: "Gujarat State Co-operative Bank",
  KSBK: "Kerala State Co-operative Bank",
  WBSC: "West Bengal State Co-operative Bank",
  TNSC: "Tamilnadu State Apex Co-operative Bank",
  KSCB: "Karnataka State Co-operative Apex Bank",

  // Regional Rural Banks (one major bank per state/region, sponsored by a
  // larger PSU bank — kept selective rather than all ~40, since this app's
  // use case is corporate/vendor payees, not exhaustive rural coverage)
  MGBX: "Maharashtra Gramin Bank",
  BUGX: "Baroda Uttar Pradesh Gramin Bank",
  UBGX: "Uttar Bihar Gramin Bank",
  RMGB: "Rajasthan Marudhara Gramin Bank",
  SUBX: "Prathama UP Gramin Bank",
  PUGX: "Punjab Gramin Bank",
  HMBX: "Himachal Pradesh Gramin Bank",
  CRGB: "Chhattisgarh Rajya Gramin Bank",
  KVGB: "Karnataka Vikas Grameena Bank",
  APGB: "Andhra Pragathi Grameena Bank",
  TGRB: "Telangana Grameena Bank",
  KLGB: "Kerala Gramin Bank",
  SAGX: "Saurashtra Gramin Bank",
  BGVX: "Bangiya Gramin Vikash Bank",
  PASX: "Paschim Banga Gramin Bank",
  JGBX: "Jharkand Gramin Bank",
  ODGB: "Odisha Gramya Bank",
  AGVX: "Assam Gramin Vikash Bank",
  TGBX: "Tripura Gramin Bank",
  MRBX: "Manipur Rural Bank",
  MERX: "Meghalaya Rural Bank",
  NAGX: "Nagaland Rural Bank",
  APRX: "Arunachal Pradesh Rural Bank",
};

/** First 4 characters of an IFSC identify the bank; the trailing 7
 * (a literal "0" plus 6 branch characters) don't affect the lookup —
 * matches on a partial/in-progress IFSC as soon as 4+ characters exist,
 * exactly like a real IFSC always would once the bank portion is typed.
 * Returns undefined (never throws, never blocks) for anything too short
 * or not in the table — an unrecognized/rare bank code, or one the
 * submitter hasn't finished typing yet, both correctly leave Bank Name
 * blank for manual entry. */
export function bankNameForIfsc(ifsc: string | null | undefined): string | undefined {
  if (!ifsc) return undefined;
  const prefix = ifsc.trim().toUpperCase().slice(0, 4);
  if (prefix.length < 4) return undefined;
  return IFSC_BANK_NAMES[prefix];
}
