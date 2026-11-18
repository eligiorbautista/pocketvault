import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { QuickActions } from './QuickActions.jsx'

describe('QuickActions', () => {
  it('links the four common flows', () => {
    render(
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Add income' })).toHaveAttribute(
      'href',
      '/income?new=1'
    )
    expect(screen.getByRole('link', { name: 'Add expense' })).toHaveAttribute(
      'href',
      '/expenses?new=1'
    )
    expect(screen.getByRole('link', { name: 'Add bill' })).toHaveAttribute(
      'href',
      '/debts?tab=bills&new=1'
    )
    expect(screen.getByRole('link', { name: 'Add wallet' })).toHaveAttribute(
      'href',
      '/wallet?new=wallet'
    )
  })
})
