export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}:,.?~",
};

function randomInt(max: number) {
  if (max <= 0) return 0;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Secure random generation is unavailable in this browser.");
  const bytes = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  do cryptoApi.getRandomValues(bytes); while (bytes[0] >= limit);
  return bytes[0] % max;
}

function securePick(chars: string) {
  return chars[randomInt(chars.length)];
}

function shuffle(chars: string[]) {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function generatePassword(opts: Record<string, string>) {
  const parsedLength = Number(opts.length);
  if (!Number.isFinite(parsedLength) || parsedLength < 8 || parsedLength > 256) throw new Error("Length must be between 8 and 256 characters.");
  const length = Math.floor(parsedLength);
  const pools: string[] = [];
  if (opts.lower !== "false") pools.push(CHARSETS.lower);
  if (opts.upper !== "false") pools.push(CHARSETS.upper);
  if (opts.numbers !== "false") pools.push(CHARSETS.numbers);
  if (opts.symbols !== "false") pools.push(CHARSETS.symbols);
  if (!pools.length) throw new Error("Select at least one character set.");
  const all = pools.join("");
  const chars = pools.map(securePick);
  while (chars.length < length) chars.push(securePick(all));
  return shuffle(chars);
}

export function estimateStrength(password: string) {
  if (!password) return { score: 0, label: "Empty", entropy: 0, guesses: "—", tips: ["Enter a password to analyze it."] };
  const lower = /[a-z]/.test(password), upper = /[A-Z]/.test(password), number = /\d/.test(password), symbol = /[^A-Za-z0-9]/.test(password);
  const pool = (lower ? 26 : 0) + (upper ? 26 : 0) + (number ? 10 : 0) + (symbol ? 33 : 0);
  const entropy = Math.round(password.length * Math.log2(Math.max(pool, 1)));
  let score = entropy >= 80 ? 4 : entropy >= 60 ? 3 : entropy >= 40 ? 2 : entropy >= 28 ? 1 : 0;
  const lowerText = password.toLowerCase();
  if (/^(.)\1+$/.test(password) || /12345|qwerty|password|letmein|admin/.test(lowerText)) score = Math.min(score, 0);
  if (/(.)\1{3,}/.test(password)) score = Math.min(score, 1);
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const tips: string[] = [];
  if (password.length < 16) tips.push("Use at least 16 characters; longer passphrases are easier to make strong.");
  if (!upper || !lower) tips.push("Mix uppercase and lowercase letters, or use a long random passphrase.");
  if (!number) tips.push("Add numbers if the site requires them.");
  if (!symbol) tips.push("Add symbols if the site allows them.");
  if (/password|qwerty|12345|admin/i.test(password)) tips.push("Avoid common words and predictable patterns.");
  return { score, label: labels[score], entropy, guesses: `~2^${entropy} possible guesses`, tips };
}
