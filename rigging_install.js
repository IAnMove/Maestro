// Optional engine: isolated recipe, shared by the menu and Update.
const runtime = require('./runtime_install')
module.exports = {
  requires: {bundle: 'ai'},
  run: [...runtime.preflight('rigging'), ...runtime.installEngines(['rigging']), {method: 'script.return', params: {success: true}}]
}
