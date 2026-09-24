import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stampEnvironment } from '../src/mcp/stampEnvironment';
import { registeredToolNamesIn } from './mcpToolClassification.test';

// ---------------------------------------------------------------------------
// EVERY TOOL ANSWER NAMES THE ENVIRONMENT IT CAME FROM — held two ways.
//
// The function: a JSON object gains `environment` from configuration; an
// object that already carries one (get_environment's own) is untouched; a
// non-object answer — a string, an array, prose — is returned as it was.
//
// The site: mcpServer.ts wraps EVERY registration's answer in stampEnvironment,
// and the count of wrapped answers equals the count of registered tools. A tool
// added tomorrow with a bare `text: await handler(input)` fails here, so the
// rule cannot be one tool short without a red test saying which.
// ---------------------------------------------------------------------------

const staging = { APP_ENV: 'staging' };

describe('stampEnvironment', () => {
  it('adds environment to a JSON object answer', () => {
    expect(JSON.parse(stampEnvironment('{"framingId":"f1"}', staging))).toEqual({ framingId: 'f1', environment: 'staging' });
  });

  it('the stamp goes FIRST and the answer’s own LAST field stays last — read_document’s `text` (A4 :1426 as ruled)', () => {
    // A client that cuts a long answer cuts its TAIL: a stamp appended after the text would be lost with it, and
    // `text` would no longer be the envelope's final field, which A4 :1425-:1426 rules (F1, the staging exercise).
    const stamped = JSON.parse(stampEnvironment('{"anchored":false,"text":"the capped text"}', staging)) as object;
    expect(Object.keys(stamped)).toEqual(['environment', 'anchored', 'text']);
  });

  it('reads production when APP_ENV is unset, as the deployment does', () => {
    expect(JSON.parse(stampEnvironment('{"a":1}', {}))).toEqual({ a: 1, environment: 'production' });
  });

  it('leaves an answer that already names its environment alone', () => {
    const own = '{"environment":"staging","verdict":"CONFIRMED"}';
    expect(stampEnvironment(own, staging)).toBe(own);
  });

  it('returns a non-object answer unchanged', () => {
    expect(stampEnvironment('[1,2]', staging)).toBe('[1,2]');
    expect(stampEnvironment('not json', staging)).toBe('not json');
    expect(stampEnvironment('"a string"', staging)).toBe('"a string"');
  });
});

describe('every registration in mcpServer.ts wraps its answer', () => {
  const source = readFileSync(join(__dirname, '../src/mcp/mcpServer.ts'), 'utf8');
  const wrapped = [...source.matchAll(/text: stampEnvironment\(await \w+\(/g)].length;
  const bare = [...source.matchAll(/text: await \w+\(/g)].length;

  it('as many wrapped answers as registered tools, and no bare one', () => {
    expect(wrapped).toBe(registeredToolNamesIn(source).length);
    expect(bare).toBe(0);
  });

  it('the scan sees a bare answer when one exists', () => {
    // The decoy: a registration written the old way must be visible to the
    // pattern above, or the zero it reports is vacuous.
    expect([...'text: await someHandler(input)'.matchAll(/text: await \w+\(/g)].length).toBe(1);
  });
});
