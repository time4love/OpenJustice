// ---------------------------------------------------------------------------
// A LEDGER LINE IS NEVER WORTH AN EXIT CODE.
//
// `emitLedgerRecord` runs from a `process.on('exit')` handler, and an uncaught
// throw there makes Node exit 1 — overwriting whatever the script decided.
//
// Measured on staging 2026-08-30: a 169KB run whose verdict was 3 ("do not pay")
// exited 1 ("bad arguments"), because `writeSync` to a full non-blocking pipe
// fails with EAGAIN rather than waiting. That regression was introduced BY the
// fix for the record being silently discarded — a silent loss replaced with a
// loud wrong answer, which is the worse of the two: a missing record is missing
// data, a wrong exit code is a wrong VERDICT, and `forensics:audit-anchors`
// exits 5 meaningfully.
//
// The isolating test is what caught it. A small run passed on the same code.
// ---------------------------------------------------------------------------

const writeSyncMock = jest.fn();
jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  writeSync: (...args: unknown[]) => writeSyncMock(...args) as unknown,
}));

import { writeLedgerLine } from '../src/lib/operationalContext';

/** The error a full non-blocking pipe produces. */
function eagain(): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error('resource temporarily unavailable');
  err.code = 'EAGAIN';
  return err;
}

beforeEach(() => {
  writeSyncMock.mockReset();
});

describe('writeLedgerLine', () => {
  it('writes the line and reports success', () => {
    writeSyncMock.mockReturnValue(undefined);
    expect(writeLedgerLine('payload')).toBe(true);
    expect(writeSyncMock).toHaveBeenCalledWith(1, 'payload');
  });

  it('retries while the pipe is draining, then succeeds', () => {
    // Back-pressure clears as the reader consumes. Retrying is the whole reason
    // the record survives a large run at all.
    writeSyncMock
      .mockImplementationOnce(() => {
        throw eagain();
      })
      .mockImplementationOnce(() => {
        throw eagain();
      })
      .mockReturnValueOnce(undefined);
    expect(writeLedgerLine('payload')).toBe(true);
    expect(writeSyncMock).toHaveBeenCalledTimes(3);
  });

  it('gives up on an error that waiting cannot clear, WITHOUT throwing', () => {
    // EPIPE means the reader is gone. Spinning until the deadline would delay
    // every exit by two seconds for a line nobody can receive.
    const gone: NodeJS.ErrnoException = new Error('broken pipe');
    gone.code = 'EPIPE';
    writeSyncMock.mockImplementation(() => {
      throw gone;
    });
    expect(() => writeLedgerLine('payload')).not.toThrow();
    expect(writeLedgerLine('payload')).toBe(false);
    // One attempt per call, not a spin.
    expect(writeSyncMock).toHaveBeenCalledTimes(2);
  });

  it('never throws, whatever the write does — the exit code is what is protected', () => {
    // The property that matters. A handler that throws rewrites the verdict, and
    // no failure mode of a best-effort record may do that.
    writeSyncMock.mockImplementation(() => {
      throw new Error('something nobody predicted');
    });
    expect(() => writeLedgerLine('payload')).not.toThrow();
    expect(writeLedgerLine('payload')).toBe(false);
  });
});
