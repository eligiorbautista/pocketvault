import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { toast } from '@renderer/store/uiStore.js'

export function SavingsGoalForm({ open, initial, onClose, onSaved }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm()

  useEffect(() => {
    if (open) {
      reset({
        goal_name: initial?.goal_name ?? '',
        target_amount: initial?.target_amount ?? '',
        deadline: initial?.deadline ?? ''
      })
    }
  }, [open, initial, reset])

  const onSubmit = async (values) => {
    const payload = {
      goal_name: values.goal_name,
      target_amount: Number(values.target_amount),
      deadline: values.deadline || null
    }
    try {
      if (initial) await window.api.savings.update(initial.id, payload)
      else await window.api.savings.create(payload)
      toast(initial ? 'Goal updated' : 'Goal created', 'success')
      onSaved()
      onClose()
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit savings goal' : 'New savings goal'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="goal-form" loading={isSubmitting}>
            {initial ? 'Save changes' : 'Create goal'}
          </Button>
        </div>
      }
    >
      <form id="goal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Goal name" htmlFor="goal_name" error={errors.goal_name?.message} required>
          <Input
            id="goal_name"
            placeholder="e.g. Emergency fund"
            hasError={Boolean(errors.goal_name)}
            {...register('goal_name', { required: 'Goal name is required' })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target amount" htmlFor="target_amount" error={errors.target_amount?.message} required>
            <Input
              id="target_amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              hasError={Boolean(errors.target_amount)}
              {...register('target_amount', {
                required: 'Target amount is required',
                validate: (value) => Number(value) > 0 || 'Must be greater than zero'
              })}
            />
          </Field>
          <Field label="Deadline" htmlFor="deadline" hint="Optional">
            <Input id="deadline" type="date" {...register('deadline')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
