// Pure Utility to convert numeric amounts to Indian Numbering System words (Crores, Lakhs, Thousands, Hundreds, Ones)

function numberToWords(amount) {
  const num = Math.floor(amount);
  if (num === 0) return 'ZERO';

  const ones = [
    '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'
  ];

  const tens = [
    '', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'
  ];

  function convertLessThanThousand(n) {
    if (n === 0) return '';

    let temp = '';
    if (n >= 100) {
      temp += ones[Math.floor(n / 100)] + ' HUNDRED ';
      n %= 100;
    }

    if (n >= 20) {
      temp += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }

    if (n > 0) {
      temp += ones[n] + ' ';
    }

    return temp.trim();
  }

  let result = '';
  let remaining = num;

  // Crores (1,00,00,000)
  if (remaining >= 10000000) {
    const crores = Math.floor(remaining / 10000000);
    result += convertLessThanThousand(crores) + ' CRORE ';
    remaining %= 10000000;
  }

  // Lakhs (1,00,000)
  if (remaining >= 100000) {
    const lakhs = Math.floor(remaining / 100000);
    result += convertLessThanThousand(lakhs) + ' LAKH ';
    remaining %= 100000;
  }

  // Thousands (1,000)
  if (remaining >= 1000) {
    const thousands = Math.floor(remaining / 1000);
    result += convertLessThanThousand(thousands) + ' THOUSAND ';
    remaining %= 1000;
  }

  // Hundreds & Below
  if (remaining > 0) {
    result += convertLessThanThousand(remaining) + ' ';
  }

  return result.trim().replace(/\s+/g, ' ');
}

module.exports = numberToWords;
