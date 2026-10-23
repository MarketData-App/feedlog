// Cut the site header's rules out of the kit's prebuilt stylesheet.
//
// `@marketdataapp/ui/css/components(.no-reset)` is a whole Tailwind build:
// design tokens on :root, Tailwind utilities (.hidden, .flex, .text-sm, ...),
// form rules on bare `label`, and — in the full file — the preflight. All of it
// is UNLAYERED, and FeedLog's own Tailwind output is layered, so loading the
// file as-is would beat every FeedLog utility it shares a name with (a
// `hidden md:flex` element would stay hidden) and swap FeedLog's tokens.
//
// What the header needs is narrow: every rule whose selector names a
// `.site-header-*`, `.user-profile-*` or `.theme-toggle-*` class (the kit keeps
// one class per role and no utility in that markup), the `--tw-*` property
// registrations those rules read, the keyframes they animate with, and the
// kit's tokens — which are re-scoped from :root / .dark onto the header so they
// cannot reach the board.

const KEEP_SELECTOR = /site-header|user-profile|theme-toggle/

// Header-side elements that carry the kit tokens. The spacer sits outside the
// <header> element and reads --spacing for its height.
const TOKEN_HOSTS = ['.site-header', '.site-header-spacer']

function scopeTokens(selector: string): string | null {
  switch (selector) {
    case ':root, :host':
      return TOKEN_HOSTS.join(', ')
    case '.dark':
      return TOKEN_HOSTS.map(h => `.dark ${h}`).join(', ')
    case `.dark, [data-theme='dark']`:
      return TOKEN_HOSTS.map(h => `:is(.dark, [data-theme='dark']) ${h}`).join(', ')
    // Fallback defaults for browsers without @property, inside @supports.
    case '*, ::before, ::after, ::backdrop':
      return ['.site-header', '.site-header *', '.site-header ::before', '.site-header ::after', '.site-header ::backdrop'].join(', ')
    default:
      return null
  }
}

interface Block { prelude: string, body: string }

// Top-level blocks of a stylesheet: `prelude { body }`. Statements such as
// `@import ...;` are dropped; comments and strings are skipped over so a brace
// inside either cannot end a block.
function splitBlocks(css: string): Block[] {
  const blocks: Block[] = []
  let i = 0
  let preludeStart = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? css.length : end + 2
      if (css.slice(preludeStart, i).trim().startsWith('/*')) preludeStart = i
      continue
    }
    if (ch === ';') {
      preludeStart = ++i
      continue
    }
    if (ch === '{') {
      const bodyStart = i + 1
      let depth = 1
      let j = bodyStart
      while (j < css.length && depth > 0) {
        const c = css[j]
        if (c === '/' && css[j + 1] === '*') {
          const end = css.indexOf('*/', j + 2)
          j = end === -1 ? css.length : end + 2
          continue
        }
        if (c === '"' || c === '\'') {
          j = skipString(css, j)
          continue
        }
        if (c === '{') depth++
        else if (c === '}') depth--
        j++
      }
      blocks.push({ prelude: css.slice(preludeStart, i).trim(), body: css.slice(bodyStart, j - 1) })
      i = j
      preludeStart = i
      continue
    }
    if (ch === '"' || ch === '\'') {
      i = skipString(css, i)
      continue
    }
    i++
  }
  return blocks
}

function skipString(css: string, start: number): number {
  const quote = css[start]
  let j = start + 1
  while (j < css.length && css[j] !== quote) j += css[j] === '\\' ? 2 : 1
  return j + 1
}

const render = (prelude: string, body: string) => `${prelude} {${body}}`

// What www.marketdata.app's page gives its header and the board's page does
// not: the body font and text colour the header inherits (the kit sans stack and
// --color-body; the board's body is Inter in its own colours), and the two kit
// tokens the header reads that the website's global.css overrides, per theme.
// Without these the board's header renders in another font and greys.
const WEBSITE_CONTEXT = `.site-header {
  font-family: var(--font-sans);
  color: var(--color-body);
  --color-body-subtle: var(--color-gray-600);
  --color-neutral-primary-strong: #F3F4F6;
}
:is(.dark, [data-theme='dark']) .site-header {
  --color-body-subtle: var(--color-gray-400);
  --color-neutral-primary-strong: var(--color-gray-700);
}`

export function extractSiteHeaderCss(kitCss: string): string {
  const rules: string[] = []
  const tokens: string[] = []
  const keyframes = new Map<string, string>()

  function walk(blocks: Block[]): string[] {
    const out: string[] = []
    for (const { prelude, body } of blocks) {
      if (/^@(media|supports|container)\b/.test(prelude)) {
        const inner = walk(splitBlocks(body))
        if (inner.length) out.push(`${prelude} {\n${inner.join('\n')}\n}`)
      } else if (/^@property --tw-/.test(prelude)) {
        out.push(render(prelude, body))
      } else if (prelude.startsWith('@keyframes')) {
        keyframes.set(prelude.replace(/^@keyframes\s+/, ''), render(prelude, body))
      } else if (prelude.startsWith('@')) {
        continue
      } else {
        const scoped = scopeTokens(prelude)
        if (scoped) {
          const block = render(scoped, body)
          out.push(block)
          tokens.push(block)
        } else if (KEEP_SELECTOR.test(prelude)) {
          const block = render(prelude, body)
          out.push(block)
          rules.push(block)
        }
      }
    }
    return out
  }

  const kept = walk(splitBlocks(kitCss))

  // Keyframes the kept rules animate with, directly or through an
  // `--animate-*` token (`animation: var(--animate-pulse)`).
  const tokenText = tokens.join('\n')
  const used = new Set<string>()
  for (const [, value] of rules.join('\n').matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) {
    let resolved = value!
    for (const [, name] of value!.matchAll(/var\((--[\w-]+)\)/g)) {
      const def = tokenText.match(new RegExp(`${name}:\\s*([^;]+);`))
      if (def) resolved += ` ${def[1]}`
    }
    for (const word of resolved.split(/[\s,()]+/)) if (word) used.add(word)
  }
  for (const [name, block] of keyframes) if (used.has(name)) kept.push(block)
  kept.push(WEBSITE_CONTEXT)

  return [
    '/* Generated at build time from @marketdataapp/ui dist/css/components.no-reset.css',
    '   by modules/site-header-css: header, account-control and theme-toggle rules only,',
    '   with the kit tokens scoped to the header, then the website page context. Do not edit. */',
    ...kept,
  ].join('\n') + '\n'
}
