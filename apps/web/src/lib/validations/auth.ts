import { z } from 'zod'
import type { Enums } from '@/types/supabase'

const indianMobileRegex = /^[6-9]\d{9}$/

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => indianMobileRegex.test(value), {
    message: 'Enter a valid 10-digit Indian mobile number',
  })

export const sendOtpSchema = z.object({
  phoneNumber: phoneSchema,
})

export const verifyOtpSchema = z.object({
  phoneNumber: phoneSchema,
  otp: z.string().trim().regex(/^\d{4,8}$/, 'Enter a valid OTP'),
})

export type SendOtpInput = z.infer<typeof sendOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

const roleValues: [Enums<'user_role'>, ...Enums<'user_role'>[]] = [
  'customer',
  'contractor',
  'worker',
  'supplier',
]

const specialisationValues = [
  'Residential',
  'Commercial',
  'Foundation',
  'Plastering',
  'Waterproofing',
  'Interior',
] as const

const tradeValues = [
  'Mason',
  'Carpenter',
  'Plumber',
  'Electrician',
  'Tile Fixer',
  'Painter',
  'Bar Bender',
  'Waterproofing Specialist',
] as const

const categoryValues = [
  'Cement',
  'Steel',
  'Bricks',
  'Sand',
  'Tiles',
  'Paint',
  'Electrical',
  'Plumbing',
  'Timber',
] as const

export const registerSchema = z
  .object({
    role: z.enum(roleValues, { message: 'Select a valid role' }),
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    city: z.string().trim().min(2, 'City is required'),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
    bio: z.string().trim().max(300, 'About you must be 300 characters or less').optional(),
    years_experience: z
      .union([z.number(), z.nan()])
      .optional()
      .transform((value) => (typeof value === 'number' && !Number.isNaN(value) ? value : undefined))
      .refine((value) => value === undefined || (value >= 0 && value <= 60), {
        message: 'Years of experience must be between 0 and 60',
      }),
    service_cities: z.string().trim().optional(),
    specialisations: z.array(z.enum(specialisationValues)).optional(),
    trade: z.enum(tradeValues).optional(),
    shop_name: z.string().trim().optional(),
    shop_address: z.string().trim().optional(),
    category_tags: z.array(z.enum(categoryValues)).optional(),
    whatsapp_number: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || /^\+?\d{10,15}$/.test(value.replace(/\s+/g, '')), {
        message: 'Enter a valid WhatsApp number',
      }),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'worker' && !data.trade) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trade'],
        message: 'Select your trade',
      })
    }

    if (data.role === 'supplier') {
      if (!data.shop_name || data.shop_name.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shop_name'],
          message: 'Shop name is required',
        })
      }

      if (!data.shop_address || data.shop_address.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shop_address'],
          message: 'Shop address is required',
        })
      }
    }
  })

export type RegisterInput = z.infer<typeof registerSchema>
