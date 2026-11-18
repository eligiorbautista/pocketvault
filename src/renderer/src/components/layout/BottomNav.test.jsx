import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BottomNav } from './BottomNav.jsx'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="path">{`${location.pathname}${location.search}`}</div>
}

function renderNav(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
      <LocationProbe />
    </MemoryRouter>
  )
}

describe('BottomNav', () => {
  it('renders the four tabs and marks the current one', () => {
    renderNav('/wallet')
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wallet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quick add' })).toBeInTheDocument()
  })

  it('marks More active for a grouped page', () => {
    renderNav('/income')
    expect(screen.getByRole('link', { name: 'More' })).toHaveClass('text-accent-700')
  })

  it('opens quick add and navigates to the chosen form', () => {
    renderNav('/')
    fireEvent.click(screen.getByRole('button', { name: 'Quick add' }))
    expect(screen.getByRole('dialog', { name: 'Quick add' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/income?new=1')
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).not.toBeInTheDocument()
  })
})
