// The authenticated user is tracked per renderer (webContents) in the main
// process. Data handlers never trust a user id sent from the renderer; they
// resolve it from this server-side session.

const sessions = new Map()

export function setSession(webContentsId, userId) {
  sessions.set(webContentsId, userId)
}

export function clearSession(webContentsId) {
  sessions.delete(webContentsId)
}

export function getSessionUserId(webContentsId) {
  return sessions.get(webContentsId) ?? null
}

export function requireUserId(webContentsId) {
  const userId = sessions.get(webContentsId)
  if (!userId) {
    const error = new Error('Not authenticated')
    error.code = 'UNAUTHENTICATED'
    throw error
  }
  return userId
}
