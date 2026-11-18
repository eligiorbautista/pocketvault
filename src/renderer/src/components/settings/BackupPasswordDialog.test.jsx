import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BackupPasswordDialog } from './BackupPasswordDialog.jsx'

describe('BackupPasswordDialog', () => {
  it('submits the export password from the footer button', () => {
    const onConfirm = vi.fn()
    render(<BackupPasswordDialog open mode="export" onClose={vi.fn()} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Backup password'), {
      target: { value: 'LongPass12345' }
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'LongPass12345' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt & export' }))

    expect(onConfirm).toHaveBeenCalledWith('LongPass12345')
  })

  it('rejects a short or mismatched export password without calling onConfirm', () => {
    const onConfirm = vi.fn()
    render(<BackupPasswordDialog open mode="export" onClose={vi.fn()} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Backup password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt & export' }))
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Backup password'), {
      target: { value: 'LongPass12345' }
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'Different12345' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt & export' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
