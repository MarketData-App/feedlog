import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { addTemplate, defineNuxtModule } from '@nuxt/kit'
import { extractSiteHeaderCss } from './extract'

// MarketData: styles for the kit's site header on the public pages. The kit's
// prebuilt stylesheet is a whole unlayered Tailwind build, so this module writes
// only the header's part of it (see ./extract.ts) into the build directory and
// adds that file to the global CSS. Built from the installed kit on every build,
// so a kit upgrade needs no regeneration step.
export default defineNuxtModule({
  meta: { name: 'site-header-css' },
  setup(_options, nuxt) {
    const require = createRequire(import.meta.url)
    const source = require.resolve('@marketdataapp/ui/css/components.no-reset')
    const template = addTemplate({
      filename: 'marketdata/site-header.css',
      write: true,
      getContents: () => extractSiteHeaderCss(readFileSync(source, 'utf8')),
    })
    nuxt.options.css.push(template.dst)
  },
})
