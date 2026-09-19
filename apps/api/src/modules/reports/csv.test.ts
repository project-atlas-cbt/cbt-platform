import { describe, expect, it } from 'vitest';
import { csv, csvCell } from './csv.js';

describe('CSV serialization', () => {
  it('neutralizes spreadsheet formula cells before quoting them', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@formula')).toBe("'@formula");
  });

  it('uses RFC4180 quoting for commas, quotes and newlines', () => {
    expect(csv([['a,b', 'a"b', 'a\nb']])).toBe('"a,b","a""b","a\nb"\r\n');
  });
});
