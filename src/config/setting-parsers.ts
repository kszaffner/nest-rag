const TRUE_TEXT = 'true';
const FALSE_TEXT = 'false';

/** The value without surrounding spaces, or undefined when it is missing or blank. */
export function readTrimmedValue(
  rawValue: string | undefined,
): string | undefined {
  const trimmedValue = rawValue?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

/**
 * Reads a setting that must be exactly "true" or "false". A missing or blank
 * value means false. Anything else (for example "yes") is an error, because a
 * typo in a security setting must not silently turn into a default.
 */
export function parseBooleanSetting(
  key: string,
  rawValue: string | undefined,
): boolean {
  const trimmedValue = readTrimmedValue(rawValue);
  if (trimmedValue === undefined || trimmedValue === FALSE_TEXT) {
    return false;
  }
  if (trimmedValue === TRUE_TEXT) {
    return true;
  }
  throw new Error(`${key} must be "${TRUE_TEXT}" or "${FALSE_TEXT}"`);
}

/**
 * Copy of the object without the properties that are undefined. Needed before
 * `{ ...defaults, ...options }`, because an undefined property in `options`
 * would overwrite the default with undefined.
 */
export function omitUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, propertyValue]) => propertyValue !== undefined,
    ),
  ) as Partial<T>;
}
