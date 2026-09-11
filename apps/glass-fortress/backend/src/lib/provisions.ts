/**
 * THE PROVISION TABLE — thesis flows A1 :1251–:1254: ONE importable table naming each provision and its element
 * shapes. A thesis carries at most one provision, fixed at creation (A2 :1262); a framing may name one (A2 :1296);
 * both columns hold a key of this table, validated at the write — never a Postgres enum, which would be a second
 * spelling of the table.
 *
 * NUREMBERG_1 is the one row the design names. Extending the table is the researcher's, in a PR (A1 :1253–:1254).
 */
export const PROVISIONS = {
  NUREMBERG_1: ['DUTY_HOLDER', 'KNOWLEDGE_POINT', 'DISCLOSURE_TIMELINE', 'DIVERGENCE'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type Provision = keyof typeof PROVISIONS;
