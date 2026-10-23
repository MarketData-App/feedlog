// Workers only (aliased in nuxt.config.ts). unenv replaces `debug` with an ES
// module whose namespace is not callable through CommonJS require(). Mastra
// memory -> probe-image-size -> stream-parser calls require('debug')('...') at
// module load, so the Worker failed to start with "require$$5 is not a
// function". This CommonJS no-op keeps the call shape and logs nothing.
function createDebug(namespace = '') {
  const log = () => {}
  log.namespace = namespace
  log.enabled = false
  log.log = () => {}
  log.extend = (suffix, delimiter = ':') => createDebug(`${namespace}${delimiter}${suffix}`)
  log.destroy = () => false
  return log
}

createDebug.default = createDebug
createDebug.debug = createDebug
createDebug.enable = () => {}
createDebug.disable = () => ''
createDebug.enabled = () => false
createDebug.coerce = value => value
createDebug.humanize = ms => `${ms}ms`
createDebug.formatters = {}
createDebug.names = []
createDebug.skips = []

module.exports = createDebug
