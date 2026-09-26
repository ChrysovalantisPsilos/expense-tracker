// The translation engine (pure: no React, no DOM, no state). i18n.js holds
// the active language and calls in here; test/i18n.test.js covers it.
//
// Why in-house instead of i18next + react-i18next: Budgeer needs five
// things (lookup with an English fallback, {{var}} interpolation, one/other
// plurals via Intl.PluralRules, rich text with React elements inside, a hook
// plus a plain t()). They fit in ~150 lines here with no dependency, where
// i18next + react-i18next would add ~20 KB gzipped to the entry chunk and
// a plugin layer we'd still have to configure to get the same result. docs/I18N.md has the conventions.

// A key names its namespace (one file per feature, src/locales/<lang>/) and a
// dotted path inside it: 'settings:appearance.title'. A key without a
// namespace uses `defaultNs`.
export function splitKey(key, defaultNs) {
  const at = key.indexOf(':')
  return at > 0 ? [key.slice(0, at), key.slice(at + 1)] : [defaultNs, key]
}

// The string at a dotted path in a namespace object, or undefined.
export function lookup(dict, path) {
  let node = dict
  for (const part of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

// "Hi {{name}}" + { name: 'Anna' } → "Hi Anna". A placeholder without a value
// is left as it is, so a missing variable shows up rather than vanishing.
export function interpolate(str, vars) {
  if (!vars) return str
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => (vars[name] == null ? m : String(vars[name])))
}

// The placeholder names a string uses, sorted: "{{a}} of {{b}}" → ['a', 'b'].
export function placeholders(str) {
  return [...new Set([...String(str).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].sort()
}

const pluralRules = new Map()
// The CLDR plural category of `count` in `lang` ('one' | 'other' for both
// English and Greek; other languages may add 'few', 'many', …).
export function pluralCategory(lang, count) {
  if (!pluralRules.has(lang)) pluralRules.set(lang, new Intl.PluralRules(lang))
  return pluralRules.get(lang).select(count)
}

// Resolve one key in one language's dictionaries ({ ns: object }): with a
// numeric `count`, the plural form `path_<category>` first (falling back to
// `path_other`), then the bare path.
export function resolveIn(dicts, lang, ns, path, count) {
  const dict = dicts?.[ns]
  if (!dict) return undefined
  if (typeof count === 'number') {
    const form = lookup(dict, `${path}_${pluralCategory(lang, count)}`) ?? lookup(dict, `${path}_other`)
    if (form !== undefined) return form
  }
  return lookup(dict, path)
}

// Translate `key` in `lang` out of `packs` ({ lang: { ns: object } }): the
// key's string with its {{placeholders}} filled (a numeric `vars.count` picks
// the plural form). A key `lang` lacks falls back to `fallback`'s string;
// lacking there too, the key itself shows. `onMissing(message)` hears of both.
export function translateIn(packs, lang, key, vars, { defaultNs = 'common', fallback = 'en', onMissing } = {}) {
  const [ns, path] = splitKey(key, defaultNs)
  const count = vars?.count
  let str = resolveIn(packs[lang], lang, ns, path, count)
  if (str === undefined && lang !== fallback) {
    onMissing?.(`${lang} has no "${ns}:${path}"; showing ${fallback}`)
    str = resolveIn(packs[fallback], fallback, ns, path, count)
  }
  if (str === undefined) {
    onMissing?.(`missing key "${ns}:${path}"`)
    return `${ns}:${path}`
  }
  return interpolate(str, vars)
}

// Rich text: a translated string may wrap words in tags that the caller maps
// to React elements (<Trans>): "Read the <terms>Terms</terms>", "one<br/>two".
// parseRich turns it into a tree of strings and { tag, children } nodes, so
// no HTML is ever parsed or injected (CLAUDE.md #5). Tag names are letters
// and digits; anything else in angle brackets stays text. A tag left open
// is closed at the end; a stray closing tag is kept as text.
export function parseRich(str) {
  const root = { tag: null, children: [] }
  const stack = [root]
  const re = /<(\/?)([A-Za-z][A-Za-z0-9]*)\s*(\/?)>/g
  let last = 0
  for (let m = re.exec(str); m; m = re.exec(str)) {
    const [raw, closing, tag, selfClosing] = m
    const top = stack[stack.length - 1]
    if (m.index > last) top.children.push(str.slice(last, m.index))
    last = m.index + raw.length
    if (selfClosing) top.children.push({ tag, children: [] })
    else if (!closing) {
      const node = { tag, children: [] }
      top.children.push(node)
      stack.push(node)
    } else if (top.tag === tag) stack.pop()
    else top.children.push(raw)
  }
  if (last < str.length) stack[stack.length - 1].children.push(str.slice(last))
  return root.children
}

// Every tag name a string's rich markup uses, sorted (for the parity test).
export function richTags(str) {
  const tags = new Set()
  const walk = (nodes) => nodes.forEach((n) => { if (typeof n !== 'string') { tags.add(n.tag); walk(n.children) } })
  walk(parseRich(String(str)))
  return [...tags].sort()
}
