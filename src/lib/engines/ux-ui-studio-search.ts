const FILLER = new Set(["a", "an", "the", "for", "of", "my", "please", "find", "show", "me", "add", "page", "pages"]);
const TYPES = new Set(["icon", "icons", "element", "elements", "shape", "shapes", "font", "fonts", "preset", "presets", "tool", "tools", "token", "tokens"]);
const ALIASES: Record<string, string[]> = {
  home: ["home", "house", "homepage"], house: ["house", "home"], homepage: ["home", "house", "homepage"],
  settings: ["settings", "gear", "cog"], search: ["search", "magnify"], user: ["user", "person", "account", "profile"],
  favourite: ["favorite", "favourite", "heart", "star"], favorite: ["favorite", "favourite", "heart", "star"],
  cart: ["cart", "shopping", "basket"], photo: ["photo", "image", "picture"], close: ["close", "x", "cancel"],
};

export function studioSearchTerms(query: string): string[] {
  return query.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(term => !FILLER.has(term) && !TYPES.has(term)) || [];
}

/** Match individual words and familiar UI synonyms, rather than one exact phrase. */
export function matchesStudioSearch(value: string, query: string): boolean {
  const words = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  return studioSearchTerms(query).every(term => (ALIASES[term] || [term]).some(alias => words.includes(alias)));
}

export function studioSearchIncludes(query: string, category: string): boolean {
  const requested = query.toLowerCase().match(/[a-z]+/g)?.filter(term => TYPES.has(term)) || [];
  return !requested.length || requested.some(term => term.replace(/s$/, "") === category.replace(/s$/, ""));
}
