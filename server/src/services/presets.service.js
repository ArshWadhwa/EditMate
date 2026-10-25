/**
 * Business logic and database queries for adjustment presets.
 */

import mongoose from 'mongoose';
import { Preset } from '../models/Preset.js';
import { notFound } from '../lib/httpError.js';

const MAX_PRESETS_PER_CLIENT = 200;

function assertValidId(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Preset');
}

export function listPresets(clientId) {
  return Preset.find({ clientId }).sort({ updatedAt: -1 }).limit(MAX_PRESETS_PER_CLIENT);
}

export async function createPreset(clientId, data) {
  return Preset.create({ ...data, clientId });
}

export async function updatePreset(clientId, id, changes) {
  assertValidId(id);
  const preset = await Preset.findOneAndUpdate({ _id: id, clientId }, changes, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!preset) throw notFound('Preset');
  return preset;
}

export async function deletePreset(clientId, id) {
  assertValidId(id);
  const result = await Preset.deleteOne({ _id: id, clientId });
  if (result.deletedCount === 0) throw notFound('Preset');
}
