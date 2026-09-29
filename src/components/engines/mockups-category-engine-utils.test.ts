import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMockupModel, normalizeMessages, parseMockupToolId } from './mockups-category-engine-utils.ts';

test('parses mockup variants', () => {
  assert.deepEqual(parseMockupToolId('whatsapp-group-chat-mockup'), { platform: 'whatsapp', kind: 'group' });
  assert.deepEqual(parseMockupToolId('gmail-read-receipt-mockup'), { platform: 'gmail', kind: 'receipt' });
  assert.deepEqual(parseMockupToolId('outlook-chat-mockup'), { platform: 'outlook', kind: 'chat' });
});
test('normalizes message sides and strips prefixes', () => {
  assert.deepEqual(normalizeMessages('them: hello\nme: hi\nplain'), [
    { side: 'them', text: 'hello' }, { side: 'me', text: 'hi' }, { side: 'them', text: 'plain' },
  ]);
});
test('builds deterministic model', () => {
  const m = buildMockupModel('telegram-read-receipt-mockup', { sender: 'Sam', messages: 'them: hi\nme: ok', status: 'Read' });
  assert.equal(m.platform, 'telegram'); assert.equal(m.kind, 'receipt'); assert.equal(m.messages[1].text, 'ok'); assert.equal(m.status, 'Read');
});
