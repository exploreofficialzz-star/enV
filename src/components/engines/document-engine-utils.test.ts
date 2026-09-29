import test from 'node:test'; import assert from 'node:assert/strict';
import { parseFlashcards, flashcardsToHtml } from './document-engine-utils.ts';
test('flashcards parse term:definition lines',()=>assert.deepEqual(parseFlashcards('A:B\nC:D'),[{term:'A',definition:'B'},{term:'C',definition:'D'}]));
test('flashcards reject malformed lines',()=>assert.throws(()=>parseFlashcards('A-B')));
test('flashcards html escapes content',()=>assert.match(flashcardsToHtml([{term:'<A>',definition:'B & C'}]),/&lt;A&gt;/));
