// Optional engine: isolated recipe, shared by the menu and Update.
const runtime = require('./runtime_install')
module.exports = {
  requires: {bundle: 'ai'},
  run: [...runtime.preflight('sam'), ...runtime.installEngines(['sam']), {method: 'script.return', params: {success: true}}]
}
