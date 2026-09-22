const OFFSET_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/i;

/** MySQL DATETIME stores wall-clock time without timezone information. */
export function mysqlDateTimeToIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const zoned = OFFSET_SUFFIX.test(normalized)
    ? normalized
    : `${normalized}+08:00`;
  const parsed = new Date(zoned);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid MySQL datetime: ${value}`);
  }
  return parsed.toISOString();
}
