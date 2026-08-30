const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

const millisecondsByUnit = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export const durationToMilliseconds = (value: string): number => {
  const match = DURATION_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`Invalid duration '${value}'.`);
  }

  const amount = Number.parseInt(match[1] ?? '', 10);
  const unit = match[2] as keyof typeof millisecondsByUnit;
  return amount * millisecondsByUnit[unit];
};

export const durationToSeconds = (value: string): number =>
  Math.max(1, Math.ceil(durationToMilliseconds(value) / 1_000));
