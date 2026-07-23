// Unit tests for amount to words converter
const numberToWords = require('../utils/numberToWords');

describe('Number to Words Converter (Indian Numbering System)', () => {
  const testCases = {
    0: 'ZERO',
    1: 'ONE',
    100: 'ONE HUNDRED',
    1000: 'ONE THOUSAND',
    100000: 'ONE LAKH',
    10000000: 'ONE CRORE',
    21626: 'TWENTY ONE THOUSAND SIX HUNDRED TWENTY SIX'
  };

  Object.entries(testCases).forEach(([amount, expectedWord]) => {
    test(`converts ${amount} to "${expectedWord}"`, () => {
      const result = numberToWords(Number(amount));
      expect(result).toBe(expectedWord);
    });
  });
});
