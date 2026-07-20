import { z } from 'zod';

export const createGroupZodSchema = z.object({
  body: z.object({
    name: z.string({
      required_error: 'Group name is required',
    }),
    contributionAmount: z.number({
      required_error: 'Contribution amount is required',
    }),
    targetPoolAmount: z.number({
      required_error: 'Target pool amount is required',
    }),
    paymentFrequency: z.enum(['weekly', 'monthly', 'quarterly'], {
      required_error: 'Payment frequency is required',
    }),
    quarterlyIntervalMonths: z.number().refine(val => [2, 3, 4, 5].includes(val), {
      message: 'Quarterly interval must be 2, 3, 4, or 5 months',
    }).optional(),
    totalCycles: z.number({
      required_error: 'Total cycles is required',
    }),
    startDate: z.string({
      required_error: 'Expected start date is required',
    }).refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid start date format',
    }),
    visibility: z.enum(['private', 'public'], {
      required_error: 'Visibility is required',
    }),
  }).strict(),
});

export const updateGroupZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    contributionAmount: z.number().optional(),
    targetPoolAmount: z.number().optional(),
    paymentFrequency: z.enum(['weekly', 'monthly', 'quarterly']).optional(),
    quarterlyIntervalMonths: z.number().refine(val => [2, 3, 4, 5].includes(val), {
      message: 'Quarterly interval must be 2, 3, 4, or 5 months',
    }).optional(),
    totalCycles: z.number().optional(),
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid start date format',
    }).optional(),
    visibility: z.enum(['private', 'public']).optional(),
  }).strict(),
});
