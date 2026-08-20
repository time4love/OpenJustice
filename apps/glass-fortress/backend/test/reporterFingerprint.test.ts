import { hashReporterEmail } from '../src/lib/reporterFingerprint';

beforeEach(() => {
  process.env['REPORTER_FINGERPRINT_SALT'] = 'jest-fingerprint-salt';
});

afterEach(() => {
  delete process.env['REPORTER_FINGERPRINT_SALT'];
});

describe('hashReporterEmail', () => {
  it('is deterministic for the same email', () => {
    const a = hashReporterEmail('reporter@example.com');
    const b = hashReporterEmail('reporter@example.com');
    expect(a).toBe(b);
  });

  it('normalizes case and surrounding whitespace before hashing', () => {
    const a = hashReporterEmail('Reporter@Example.com');
    const b = hashReporterEmail('  reporter@example.com  ');
    expect(a).toBe(b);
  });

  it('produces different hashes for different emails', () => {
    const a = hashReporterEmail('reporter-a@example.com');
    const b = hashReporterEmail('reporter-b@example.com');
    expect(a).not.toBe(b);
  });

  it('throws when REPORTER_FINGERPRINT_SALT is not set', () => {
    delete process.env['REPORTER_FINGERPRINT_SALT'];
    expect(() => hashReporterEmail('reporter@example.com')).toThrow(
      'REPORTER_FINGERPRINT_SALT env var is not set',
    );
  });
});
