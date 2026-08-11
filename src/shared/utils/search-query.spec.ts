import { searchPattern } from './search-query';

describe('searchPattern', () => {
  it('treats user-entered regular-expression characters as literal text', () => {
    const pattern = searchPattern('source (A)+ [draft]');

    expect(pattern.test('Source (A)+ [draft] review')).toBe(true);
    expect(pattern.test('Source AAA draft review')).toBe(false);
  });
});
