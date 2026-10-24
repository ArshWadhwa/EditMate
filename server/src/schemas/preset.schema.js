import { z } from 'zod';
import { ADJUSTMENTS } from '@editmate/shared';

const adjustmentsSchema = z.strictObject(
  Object.fromEntries(
    ADJUSTMENTS.map(({ key, min, max }) => [key, z.number().int().min(min).max(max).default(0)]),
  ),
);

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a #rrggbb color');

export const createPresetSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(40),
  adjustments: adjustmentsSchema,
  swatch: z.array(hexColor).max(6).default([]),
  source: z.enum(['manual', 'inspiration']).default('manual'),
});

export const updatePresetSchema = z
  .strictObject({
    name: createPresetSchema.shape.name,
    adjustments: adjustmentsSchema,
    swatch: z.array(hexColor).max(6),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');
