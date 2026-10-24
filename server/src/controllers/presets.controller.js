import * as presets from '../services/presets.service.js';

export async function list(req, res) {
  res.json({ presets: await presets.listPresets(req.clientId) });
}

export async function create(req, res) {
  const preset = await presets.createPreset(req.clientId, req.body);
  res.status(201).json({ preset });
}

export async function update(req, res) {
  const preset = await presets.updatePreset(req.clientId, req.params.id, req.body);
  res.json({ preset });
}

export async function remove(req, res) {
  await presets.deletePreset(req.clientId, req.params.id);
  res.status(204).end();
}
