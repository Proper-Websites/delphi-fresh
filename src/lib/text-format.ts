const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "via",
]);

const FIXED_WORD_MAP: Record<string, string> = {
  llc: "LLC",
  inc: "Inc.",
  "inc.": "Inc.",
  co: "Co.",
  "co.": "Co.",
  corp: "Corp.",
  "corp.": "Corp.",
  ltd: "Ltd.",
  "ltd.": "Ltd.",
  plc: "PLC",
  lp: "LP",
  llp: "LLP",
  pllc: "PLLC",
  pc: "PC",
  dba: "DBA",
};

const capToken = (token: string) =>
  token.toLowerCase().replace(/(^[a-z])|([\-/'’][a-z])/g, (match) => match.toUpperCase());

const formatToken = (token: string) => {
  const normalized = token.toLowerCase();
  if (FIXED_WORD_MAP[normalized]) return FIXED_WORD_MAP[normalized];
  return capToken(token);
};

export const toSmartTitleCase = (value: string) => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const parts = trimmed.split(" ");
  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index > 0 && index < parts.length - 1 && SMALL_WORDS.has(lower)) return lower;
      return formatToken(part);
    })
    .join(" ");
};

// Live formatter for input typing: preserves user spacing while auto-capitalizing words.
export const toSmartTitleCaseLive = (value: string) => {
  if (!value) return "";
  const tokens = value.split(/(\s+)/);
  const wordIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.trim().length > 0)
    .map(({ index }) => index);
  const totalWords = wordIndexes.length;
  if (!totalWords) return value;

  let wordPosition = 0;
  return tokens
    .map((token) => {
      if (token.trim().length === 0) return token;
      const lower = token.toLowerCase();
      const isSmallWord = wordPosition > 0 && wordPosition < totalWords - 1 && SMALL_WORDS.has(lower);
      const nextToken = isSmallWord ? lower : formatToken(token);
      wordPosition += 1;
      return nextToken;
    })
    .join("");
};
