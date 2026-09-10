// Execute launcher plans with mocked Pinokio capabilities; never install packages.
const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const runtime = require('../runtime_install')

function render(template, context) {
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => vm.runInNewContext(expression, context))
}

function context(platform) {
  return {platform, path: platform === 'win32' ? path.win32 : path.posix,
    cwd: platform === 'win32' ? 'C:\\Pinokio Apps\\HocusPocus' : '/tmp/other location/hocus',
    which: () => platform === 'win32' ? 'C:\\CUDA\\bin\\nvcc.exe' : '/opt/cuda/bin/nvcc',
    exists: () => true, input: {success: true},
    local: {runtime: {engines: Object.fromEntries(Object.keys(runtime.catalog.engines).map(k => [k, {supported: true, installed: false}]))}},
  }
}

for (const platform of ['linux', 'win32']) {
  const ctx = context(platform)
  const steps = runtime.installEngines(['wangp', 'hunyuan3d', 'minimax_h3'])
    .filter(step => render(step.when, ctx) === 'true')
  for (const step of steps.filter(s => s.method === 'shell.run')) {
    const command = render(step.params.message, ctx)
    assert(command.includes('runtime_failed.py'), 'Every shell failure must propagate')
    if (!step.params.env) continue
    const constraint = render(step.params.env.UV_CONSTRAINT, ctx)
    assert.equal(constraint, ctx.path.resolve(ctx.cwd, `app/runtime/constraints/${platform}-${
      constraint.match(/(?:linux|win32)-(\w+)\.txt$/)[1]}.txt`))
    if (command.includes('runtime_pip.py')) {
      assert(!command.includes("path.resolve('"))
      assert(command.includes(ctx.cwd), 'Package install must select this checkout explicitly')
    }
  }
  const all = JSON.stringify(steps)
  if (platform === 'win32') {
    assert(!all.includes('targets/x86_64-linux'))
    assert(!all.includes('bash compile_mesh_painter'))
    assert(all.includes('build_mesh_painter.py'))
    assert.equal(runtime.python('minimax_h3', platform), 'app/services/minimax_h3/env/python.exe')
  }
}

// A child aborts with undefined in Pinokio; the parent must stop, not publish success.
const guard = runtime.call('torch.js')[1]
for (const input of [undefined, null, {}, {success: false}]) {
  assert.equal(render(guard.when, {input}), 'true')
  assert.equal(guard.next, null)
}
assert.equal(render(guard.when, {input: {success: true}}), 'false')
for (const filename of ['torch', 'runtime_setup', 'sam_install', 'rigging_install', 'ui_build']) {
  const final = require(`../${filename}.js`).run.at(-1)
  assert.equal(final.method, 'script.return')
  assert.equal(final.params.success, true)
}
assert(!runtime.guarded('some-command').includes('Error:'), 'PTY echo must not trigger an error on success')

// Real host shell, including cmd.exe on Windows CI. A silent failure must
// produce Pinokio's error sentinel and never execute the following command.
const {spawnSync} = require('node:child_process')
const host = {...context(process.platform), path, cwd: path.resolve(__dirname, '..')}
for (const exitCode of [0, 7]) {
  const command = render(runtime.guarded([
    `python -c "import sys; sys.exit(${exitCode})"`,
    'python -c "print(731729)"',
  ]), host)
  const result = spawnSync(command, {shell: true, encoding: 'utf8'})
  assert(!result.error, result.error?.message)
  const output = result.stdout + result.stderr
  assert.equal(output.includes('731729'), exitCode === 0, output)
  assert.equal(output.includes('Error: HOCUS_RUNTIME_FAILED'), exitCode !== 0, output)
}
console.log('Runtime profile launcher execution contract: PASS')

async function checkUiLaunchers() {
  for (const plan of [require('../runtime_setup'), await require('../start')({port: async () => 7860})]) {
    assert.equal(plan.run[0].method, 'script.start')
    assert.equal(plan.run[0].params.uri, 'ui_build.js')
    assert.equal(plan.run[1].next, null, 'A failed UI child must stop setup/start')
  }
  const menu = require('../pinokio').menu
  const info = {exists: () => true, running: () => false, local: () => ({})}
  const repair = (await menu({}, info)).find(item => item.href === 'ui_build.js')
  assert.equal(repair.params.force, true)
  const busy = await menu({}, {...info, running: name => name === 'ui_build.js'})
  assert.equal(busy[0].href, 'ui_build.js')
  assert.equal(busy[0].default, true)
  console.log('React repair/start/menu contract: PASS')
}
checkUiLaunchers().catch(error => { console.error(error); process.exitCode = 1 })
