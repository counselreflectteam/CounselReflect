// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseCustomMetricLabels, parseCustomMetricScale } from '@shared/utils/customMetricScale';

describe('parseCustomMetricScale', () => {
  it('parses the backend categorical enum grammar', () => {
    expect(parseCustomMetricScale('enum{Low|Medium|High}')).toEqual({
      type: 'categorical',
      options: ['Low', 'Medium', 'High']
    });
  });

  it('does not treat hyphenated category labels as numerical ranges', () => {
    expect(parseCustomMetricScale('enum{Not-observed|Partly-observed|Observed}').type).toBe('categorical');
  });

  it('preserves a zero minimum in a numerical range', () => {
    expect(parseCustomMetricScale('0-5 integer')).toEqual({
      type: 'numerical',
      range: [0, 5]
    });
  });

  it('honors the user-selected categorical type for a plain label list', () => {
    expect(parseCustomMetricScale('Absent / Emerging / Consistent', 'categorical')).toEqual({
      type: 'categorical',
      options: ['Absent', 'Emerging', 'Consistent']
    });
  });
});

describe('parseCustomMetricLabels', () => {
  it('trims labels and removes case-insensitive duplicates', () => {
    expect(parseCustomMetricLabels('Absent, Emerging, absent, Consistent')).toEqual([
      'Absent',
      'Emerging',
      'Consistent'
    ]);
  });
});
