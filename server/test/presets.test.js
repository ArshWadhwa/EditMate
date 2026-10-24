import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { Preset } from '../src/models/Preset.js';

const CLIENT = 'test-client-0001';
const OTHER_CLIENT = 'test-client-0002';

let mongo;
const app = createApp();
const api = (clientId = CLIENT) => ({
  get: (url) => request(app).get(url).set('X-Client-Id', clientId),
  post: (url) => request(app).post(url).set('X-Client-Id', clientId),
  patch: (url) => request(app).patch(url).set('X-Client-Id', clientId),
  delete: (url) => request(app).delete(url).set('X-Client-Id', clientId),
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await Preset.syncIndexes();
});

after(async () => {
  await disconnectDatabase();
  await mongo?.stop();
});

beforeEach(() => Preset.deleteMany({}));

describe('presets API', () => {
  test('rejects requests without a client id', async () => {
    const res = await request(app).get('/api/presets');
    assert.equal(res.status, 400);
  });

  test('creates a preset with defaults filled in', async () => {
    const res = await api().post('/api/presets').send({
      name: '  Golden hour ',
      adjustments: { warmth: 22, contrast: 18 },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.preset.name, 'Golden hour');
    assert.equal(res.body.preset.adjustments.warmth, 22);
    assert.equal(res.body.preset.adjustments.brightness, 0);
    assert.equal(res.body.preset.source, 'manual');
    assert.ok(res.body.preset.id);
    assert.equal(res.body.preset.clientId, undefined);
  });

  test('validates adjustment ranges and unknown keys', async () => {
    const outOfRange = await api().post('/api/presets').send({ name: 'x', adjustments: { fade: -5 } });
    assert.equal(outOfRange.status, 400);
    assert.equal(outOfRange.body.details[0].path, 'adjustments.fade');

    const unknown = await api().post('/api/presets').send({ name: 'x', adjustments: { sharpness: 5 } });
    assert.equal(unknown.status, 400);
  });

  test('enforces unique names per client, case-insensitively', async () => {
    await api().post('/api/presets').send({ name: 'Moody', adjustments: {} }).expect(201);
    await api().post('/api/presets').send({ name: 'moody', adjustments: {} }).expect(409);
    await api(OTHER_CLIENT).post('/api/presets').send({ name: 'Moody', adjustments: {} }).expect(201);
  });

  test('scopes list, update and delete to the owning client', async () => {
    const { body } = await api().post('/api/presets').send({ name: 'Mine', adjustments: {} });
    const id = body.preset.id;

    const foreignList = await api(OTHER_CLIENT).get('/api/presets');
    assert.deepEqual(foreignList.body.presets, []);
    await api(OTHER_CLIENT).patch(`/api/presets/${id}`).send({ name: 'Stolen' }).expect(404);
    await api(OTHER_CLIENT).delete(`/api/presets/${id}`).expect(404);

    const renamed = await api().patch(`/api/presets/${id}`).send({ name: 'Renamed' }).expect(200);
    assert.equal(renamed.body.preset.name, 'Renamed');

    await api().delete(`/api/presets/${id}`).expect(204);
    const list = await api().get('/api/presets');
    assert.deepEqual(list.body.presets, []);
  });

  test('returns 404 for malformed ids', async () => {
    await api().delete('/api/presets/not-an-id').expect(404);
  });
});
