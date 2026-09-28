// Monetary values are persisted as peso floats (schema compatibility) but every
// arithmetic operation is performed on integer centavos to avoid binary
// floating-point drift. Convert at the calculation boundaries only.

export function toCents(value) {
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function fromCents(cents) {
  return Math.round(cents) / 100
}

export function round2(value) {
  return fromCents(toCents(value))
}

export function sumPesos(values) {
  const cents = values.reduce((acc, v) => acc + toCents(v), 0)
  return fromCents(cents)
}
