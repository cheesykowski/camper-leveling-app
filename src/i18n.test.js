import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLanguage, translate } from './i18n.js';

test('defaults missing and unsupported languages to English', () => {
  assert.equal(normalizeLanguage(undefined), 'en');
  assert.equal(normalizeLanguage('fr'), 'en');
  assert.equal(normalizeLanguage('de'), 'de');
});

test('translates messages and preserves user-provided slot names', () => {
  assert.equal(translate('en', 'WEDGES'), 'WEDGES');
  assert.equal(translate('de', 'WEDGES'), 'KEILE');
  assert.equal(translate('de', 'HOLD TO SET SLOT {slot}', { slot: 'Bed' }), 'HALTEN FÜR PLATZ Bed');
  assert.equal(
    translate('de', 'Enter a value between {min} and {max} cm.', { min: 100, max: 500 }),
    'Wert zwischen 100 und 500 cm eingeben.',
  );
});

test('reports missing translations and interpolation values', () => {
  assert.throws(() => translate('de', 'Unknown message'), /Missing German translation/);
  assert.throws(() => translate('en', 'STEP {step}'), /Missing translation value: step/);
});
