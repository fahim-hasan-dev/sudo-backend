import { z } from 'zod';

export const updateSettingsZodSchema = z.object({
  body: z.object({
    platformCommission: z
      .number({
        invalid_type_error: 'Platform commission must be a number',
      })
      .min(0, 'Commission cannot be negative')
      .max(100, 'Commission cannot exceed 100 percent')
      .optional(),
  }).strict(),
});
