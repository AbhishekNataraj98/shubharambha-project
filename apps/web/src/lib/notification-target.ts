export type NotificationTargetInput = {
  type: string
  project_id: string | null
  payment_id: string | null
  update_id: string | null
}

export function getWebNotificationTarget(input: NotificationTargetInput): string {
  if (input.type === 'project_invite' || input.type === 'project_invite_response') {
    return '/profile#invitations'
  }

  if (!input.project_id) return '/notifications'

  const isPaymentNotification = input.type.startsWith('payment_')
  const isUpdateNotification = input.type.startsWith('update_')

  if (isPaymentNotification) {
    return `/projects/${input.project_id}?tab=payments&paymentId=${input.payment_id ?? ''}`
  }

  if (isUpdateNotification) {
    return `/projects/${input.project_id}?tab=updates&updateId=${input.update_id ?? ''}`
  }

  return `/projects/${input.project_id}`
}
