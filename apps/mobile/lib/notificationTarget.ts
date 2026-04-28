export type MobileNotificationTargetInput = {
  type: string
  project_id: string | null
  payment_id: string | null
  update_id: string | null
}

export type MobileNotificationTarget =
  | { kind: 'profile-invitations' }
  | {
      kind: 'project'
      id: string
      tab?: 'payments' | 'updates'
      paymentId?: string
      updateId?: string
    }
  | { kind: 'none' }

export function getMobileNotificationTarget(input: MobileNotificationTargetInput): MobileNotificationTarget {
  if (input.type === 'project_invite' || input.type === 'project_invite_response') {
    return { kind: 'profile-invitations' }
  }
  if (!input.project_id) return { kind: 'none' }

  const isPaymentNotification = input.type.startsWith('payment_')
  if (isPaymentNotification) {
    return {
      kind: 'project',
      id: input.project_id,
      tab: 'payments',
      paymentId: input.payment_id ?? undefined,
    }
  }

  const isUpdateNotification = input.type.startsWith('update_')
  if (isUpdateNotification) {
    return {
      kind: 'project',
      id: input.project_id,
      tab: 'updates',
      updateId: input.update_id ?? undefined,
    }
  }

  return { kind: 'project', id: input.project_id }
}
