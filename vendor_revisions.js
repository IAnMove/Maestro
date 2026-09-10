// Shared by Pinokio recipes and Python runtime verification.
const vendors = require('./app/runtime/vendors.json')
module.exports = Object.freeze(Object.fromEntries(
  Object.entries(vendors).map(([name, entry]) => [name, Object.freeze(entry)])
))
