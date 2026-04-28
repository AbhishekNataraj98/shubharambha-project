export function formatIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
}

export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  return `+91${digits}`
}
