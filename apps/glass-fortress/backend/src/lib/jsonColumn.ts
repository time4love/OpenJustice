import type { Prisma } from '@prisma/client';

/**
 * A value as a Json column will hold it.
 *
 * Prisma's `InputJsonValue` refuses an interface — a type with a name has no
 * index signature — so every writer of a Json column reaches for a cast, and
 * this repository holds five spellings of `as unknown as Prisma.InputJsonValue`.
 * A cast asserts the value is already JSON; it is not always: an `undefined`
 * field, a `Date`, a `bigint` each survive the cast and fail, or change shape,
 * at the database. The round trip through JSON is the honest version of the
 * same statement — it PRODUCES the JSON the column will hold, dropping what
 * JSON drops and refusing what JSON refuses, at the site that writes it.
 *
 * One helper, so a stop's material (`unknown` by design) and a classifier's
 * output (an interface by design) cross the boundary the same way.
 */
export function asJsonColumn(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
