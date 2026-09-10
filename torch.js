// Main-engine accelerators use the same environment and ABI constraints.
const runtime = require('./runtime_install')
module.exports = {
  requires: {bundle: 'ai'},
  run: [
    ...runtime.preflight('wangp'),
    ...['linux', 'win32'].map(platform => ({
      when: `{{platform === '${platform}'}}`, method: 'shell.run', params: {
        ...runtime.shell('wangp', platform),
        message: runtime.guarded([
          ...runtime.selected('wangp', platform).acceleratorPackages.map(pkg =>
            runtime.pip('wangp', platform, `install ${pkg}`)),
          runtime.pip('wangp', platform, 'install hf-xet pip'),
          'python app/scripts/install_gguf_kernels.py',
        ]),
      },
    })),
    {method: 'fs.write', params: {path: 'app/env/.maestro_torch_v1.installed',
      text: 'Main ABI constrained by app/runtime/profiles.json; final verification is in runtime_setup.js.'}},
    {method: 'script.return', params: {success: true}},
  ],
}
