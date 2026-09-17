// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getNotApplicableCopy } from '@shared/utils/metricUtils';

describe('getNotApplicableCopy', () => {
  it('distinguishes one-turn guidance from whole-conversation guidance', () => {
    const copy = getNotApplicableCopy('Empathy');

    expect(copy.description).toContain('any turn in this conversation');
    expect(copy.turnDescription).toContain('this turn');
    expect(copy.turnDescription).not.toContain('conversation');
  });

  it('uses event-specific guidance for alliance rupture and repair', () => {
    const copy = getNotApplicableCopy('Alliance Rupture Repair');

    expect(copy.turnTitle).toBe('No alliance rupture detected for this turn');
    expect(copy.turnDescription).toContain('rupture or repair event');
  });
});
