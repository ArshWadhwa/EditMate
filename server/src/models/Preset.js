import mongoose from 'mongoose';
import { ADJUSTMENTS } from '@editmate/shared';

const adjustmentFields = Object.fromEntries(
  ADJUSTMENTS.map(({ key, min, max }) => [key, { type: Number, min, max, default: 0 }]),
);

const presetSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    adjustments: { type: new mongoose.Schema(adjustmentFields, { _id: false }), required: true },
    swatch: { type: [String], default: [] },
    source: { type: String, enum: ['manual', 'inspiration'], default: 'manual' },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.clientId;
        return ret;
      },
    },
  },
);

// Names are how people find presets, so keep them unique per owner (case-insensitive).
presetSchema.index(
  { clientId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export const Preset = mongoose.model('Preset', presetSchema);
