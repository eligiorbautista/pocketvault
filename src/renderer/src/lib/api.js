import { isElectron } from './platform.js'

// The unified DatabaseAdapter surface. Every module in the renderer talks to
// this object only; it resolves to the Electron preload bridge on desktop and
// to the Capacitor (SQLite + Filesystem) adapter on Android. Both expose the
// exact same shape, so call sites never branch on the platform.
let implementationPromise = null

export function resolveApi() {
  if (!implementationPromise) {
    implementationPromise = (
      isElectron
        ? Promise.resolve(window.api)
        : import('./capacitor/api.js').then((module) => module.createCapacitorApi())
    ).catch((error) => {
      // Reset so a later call can retry instead of caching the rejection.
      implementationPromise = null
      throw error
    })
  }
  return implementationPromise
}

export const api = new Proxy(
  {},
  {
    get(_target, domain) {
      return new Proxy(
        {},
        {
          get(_target, method) {
            return (...args) =>
              resolveApi().then((implementation) => implementation[domain][method](...args))
          }
        }
      )
    }
  }
)
