/**
 * Express router definitions for preset API endpoints.
 */

import { Router } from 'express';
import * as controller from '../controllers/presets.controller.js';
import { requireClientId } from '../middleware/clientId.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validateBody } from '../middleware/validate.js';
import { createPresetSchema, updatePresetSchema } from '../schemas/preset.schema.js';

export const presetsRouter = Router();

presetsRouter.use(requireClientId, requireDatabase);

presetsRouter.get('/', controller.list);
presetsRouter.post('/', validateBody(createPresetSchema), controller.create);
presetsRouter.patch('/:id', validateBody(updatePresetSchema), controller.update);
presetsRouter.delete('/:id', controller.remove);
