// UI-only repair/ensure. No model, Torch, CUDA or Python package installation.
const runtime = require('./runtime_install')
module.exports = {
  run: [
    {method: 'shell.run', params: {
      message: runtime.guarded("python scripts/build_ui.py {{args.force ? '--force' : ''}}"),
    }},
    {method: 'script.return', params: {success: true}},
  ],
}
