const runtime = require("./runtime_install")
module.exports = {
  run: [{
    // Never let Update merge around uncommitted work. shell.run returns the
    // porcelain output as input.stdout; the next documented jump either stops
    // with a recoverable message or proceeds to a fast-forward-only pull.
    // The single Maestro repository contains both `ui/` and `app/`, so one
    // clean-tree check protects the complete launcher and application.
    method: "shell.run",
    params: {
      message: "git status --porcelain"
    }
  }, {
    method: "jump",
    params: {
      id: "{{/(?:^|\\r?\\n)[ MADRCU?!]{2} /.test(input.stdout) ? 'dirty' : 'pull'}}"
    }
  }, {
    id: "dirty",
    method: "log",
    params: {
      raw: "Update stopped safely: HocusPocus has uncommitted changes. Commit or stash them before updating; no files were changed."
    },
    next: null
  }, {
    id: "pull",
    method: "shell.run",
    params: {
      env: {
        LC_ALL: "C"
      },
      message: "git pull --ff-only"
    }
  }, {
    // Load the updated recipe module after the fast-forward, never a stale
    // in-memory plan constructed before git pull.
    method: "jump",
    params: {
      id: "{{/(?:fatal:|error:|aborting|no tracking information|specify which branch)/i.test(input.stdout) ? 'pull_failed' : 'build'}}"
    }
  }, {
    id: "pull_failed",
    method: "log",
    params: {raw: "Update stopped safely because Git could not fast-forward the current branch; dependencies were not changed."},
    next: null
  }, {
    id: "build",
    method: "script.start",
    params: {uri: "runtime_setup.js", params: {update: true}}
  }, runtime.call("runtime_setup.js")[1]]
}
