import { describe, it, expect } from 'vitest';

describe('textParts: what a text costs (George, 2026-11-28)', () => {
  it('plain text fits 160, an emoji or curly quote drops it to 70', async () => {
    const { textParts, plainText, fancyChars } = await import('../src/quo/quo');
    expect(textParts('a'.repeat(160))).toBe(1);
    expect(textParts('a'.repeat(161))).toBe(2);
    expect(textParts('a'.repeat(80) + '😊')).toBe(2);
    expect(textParts('It’s ' + 'a'.repeat(70))).toBe(2);
    expect(textParts(plainText('It’s ' + 'a'.repeat(70)))).toBe(1);
    expect(fancyChars('Hi “Bob” 😊')).toEqual(['“', '”', '😊']);
  });
});
