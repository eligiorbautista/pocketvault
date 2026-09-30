// Re-exported from the shared reminders module so the UI schedule and the
// notification scheduler use exactly the same math.
export {
  buildInstallments,
  installmentStatus,
  deriveFirstPaymentDate,
  nextUnpaidInstallment,
  effectiveDueDate
} from '@shared/reminders.js'
