// Unit and Integration tests for invoice numbering and concurrency
const Database = require('../database/db');
const path = require('path');
const fs = require('fs');

function getFinancialYear(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth(); // April is index 3
  const year = date.getFullYear();
  if (month >= 3) {
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

describe('Invoice Numbering & Financial Year Rules', () => {
  beforeAll(() => {
    // Delete mock_db to reset counters before testing
    const dbPath = path.join(__dirname, '../database/mock_db.json');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('Boundary derivation of financial year', () => {
    const testBoundaries = {
      '2026-03-31': '2025-26',
      '2026-04-01': '2026-27',
      '2027-01-15': '2026-27',
      '2025-12-31': '2025-26'
    };

    for (const [date, expectedFy] of Object.entries(testBoundaries)) {
      const fy = getFinancialYear(date);
      expect(fy).toBe(expectedFy);
    }
  });

  test('Concurrency testing with 10 simultaneous runs', async () => {
    const fyKey = '2026-27';

    // Fire 10 simultaneous rpc calls
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        Database.query(null, 'rpc', {
          function: 'get_next_invoice_number',
          args: { fy: fyKey }
        })
      );
    }

    const results = await Promise.all(promises);

    // Validate we got numbers 1 to 10 uniquely
    results.sort((a, b) => a - b);
    for (let i = 0; i < 10; i++) {
      const expectedNum = i + 1;
      expect(results[i]).toBe(expectedNum);
    }
  });
});
