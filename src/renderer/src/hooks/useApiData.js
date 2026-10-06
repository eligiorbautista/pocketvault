import { useCallback, useEffect, useRef, useState } from 'react'

export function useApiData(loader, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await loaderRef.current()
      if (mountedRef.current && requestId === requestIdRef.current) setData(result)
      return result
    } catch (err) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(err?.message || 'Something went wrong')
      }
      return null
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (immediate) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload, setData }
}
