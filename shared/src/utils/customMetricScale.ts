export interface ParsedCustomMetricScale {
  type: 'categorical' | 'numerical';
  range?: [number, number];
  options?: string[];
}

const uniqueLabels = (labels: string[]): string[] => {
  const seen = new Set<string>();

  return labels.filter((label) => {
    const normalized = label.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

export const parseCustomMetricLabels = (value: string): string[] =>
  uniqueLabels(value.split(/[,|/]/).map((label) => label.trim()));

/**
 * Parses the scale grammar emitted by the custom-rubric backend. In
 * particular, categorical scales use enum{A|B}; checking for a hyphen alone
 * is not sufficient because category labels may themselves be hyphenated.
 */
export const parseCustomMetricScale = (
  scale: string,
  expectedType?: 'categorical' | 'numerical'
): ParsedCustomMetricScale => {
  const normalized = scale.trim();
  const enumMatch = normalized.match(/^enum\s*\{([\s\S]*)\}$/i);

  if (enumMatch) {
    return {
      type: 'categorical',
      options: uniqueLabels(enumMatch[1].split('|').map((label) => label.trim()))
    };
  }

  if (expectedType === 'categorical') {
    return {
      type: 'categorical',
      options: parseCustomMetricLabels(normalized)
    };
  }

  const rangeMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    return {
      type: 'numerical',
      range: [Number(rangeMatch[1]), Number(rangeMatch[2])]
    };
  }

  if (expectedType === 'numerical') {
    return { type: 'numerical', range: [0, 5] };
  }

  const labels = parseCustomMetricLabels(normalized);
  return labels.length > 1
    ? { type: 'categorical', options: labels }
    : { type: 'numerical', range: [0, 5] };
};

