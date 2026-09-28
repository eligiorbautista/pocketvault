import { Field } from './Field.jsx'
import { Input, Select } from './Input.jsx'

// value: { mode: 'month'|'range'|'all', month: 'YYYY-MM', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
export function PeriodFilter({
  modes = ['month', 'range', 'all'],
  value,
  onChange,
  idPrefix = 'period'
}) {
  const update = (key) => (event) => onChange({ ...value, [key]: event.target.value })

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Period" htmlFor={`${idPrefix}-mode`} className="w-40">
        <Select id={`${idPrefix}-mode`} value={value.mode} onChange={update('mode')}>
          {modes.includes('month') ? <option value="month">By month</option> : null}
          {modes.includes('range') ? <option value="range">Custom range</option> : null}
          {modes.includes('all') ? <option value="all">All records</option> : null}
        </Select>
      </Field>

      {value.mode === 'month' ? (
        <Field label="Month" htmlFor={`${idPrefix}-month`} className="w-40">
          <Input
            id={`${idPrefix}-month`}
            type="month"
            value={value.month}
            onChange={update('month')}
          />
        </Field>
      ) : null}

      {value.mode === 'range' ? (
        <>
          <Field label="From" htmlFor={`${idPrefix}-from`} className="w-40">
            <Input
              id={`${idPrefix}-from`}
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={update('from')}
            />
          </Field>
          <Field label="To" htmlFor={`${idPrefix}-to`} className="w-40">
            <Input
              id={`${idPrefix}-to`}
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={update('to')}
            />
          </Field>
        </>
      ) : null}
    </div>
  )
}

// Returns the payload for reports:dashboard from a PeriodFilter value.
export function dashboardPeriodPayload(period, fallbackMonth) {
  if (period.mode === 'month') return { mode: 'month', month: period.month || fallbackMonth }
  if (period.mode === 'range') {
    return {
      mode: 'range',
      from: period.from || '0001-01-01',
      to: period.to || '9999-12-31'
    }
  }
  return { mode: 'all' }
}
