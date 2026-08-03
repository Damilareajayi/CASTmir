/**
 * Data source registry — every source adapter exposes the same function
 * contract (see synthetic.js/reliaquest.js/fsuIts.js), so server.js just
 * picks one by id and calls it. Add a new endpoint by adding a module here.
 */
import * as synthetic from './synthetic.js'
import * as reliaquest from './reliaquest.js'
import * as fsuIts from './fsuIts.js'

export const SOURCES = { synthetic, reliaquest, fsu_its: fsuIts }
export const DEFAULT_SOURCE = 'synthetic'

export function resolveSource(id) {
  return SOURCES[id] || SOURCES[DEFAULT_SOURCE]
}

export function listSources() {
  return Object.values(SOURCES).map(mod => mod.meta)
}
