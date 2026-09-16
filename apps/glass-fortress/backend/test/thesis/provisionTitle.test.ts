jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import type { Router } from 'express';
import express from 'express';
import request from 'supertest';
import { PROVISIONS, type ProvisionShape } from '../../src/lib/provisions';
import { resetDouble, store } from '../helpers/evidenceDouble';
import { built } from './absent';
import { ATTEMPT, PROVISION, THESIS } from './fixtures';
import { AS_PUBLISHED, resetTools, seedThesis } from './tools';

// ---------------------------------------------------------------------------
// THE PROVISION'S TITLE ON THE PUBLIC THESIS BODY — docs/gf-ui-flows.md §17 :529–:530
// ("the provision, named by its table entry"), thesis A1 :1251–:1254 (ONE importable
// table naming each provision), A5 :1565–:1569 (the body); the researcher's ruling
// q4 (b), 2026-09-16 (UI-5's §g).
//
// THE PAGE MUST NOT SPELL THE TITLE. The names live in ONE table, `src/lib/provisions.ts`,
// and a second copy of them — in the frontend's messages, or as a literal in the builder —
// is the second spelling A1 :1247–:1250 forbids for NORMALISE and A7's one-symbol scan
// holds for PROVISIONS. So the body carries the title the TABLE holds, read from it.
//
// HOW THIS CASE TELLS A READ FROM A RE-SPELLING: the case replaces the table's entry with
// a MARKED title before the read. A builder that reads the table answers the marker; a
// builder carrying the real title as a literal answers the real title, and fails. The
// whole ENTRY is replaced (not its `title`) through a WIDENED alias of the same object:
// `PROVISIONS` is `as const`, so every `title` is a readonly literal type and
// `jest.replaceProperty` cannot type-check against it. `elements` is carried over
// unchanged, so every other reader of the table sees exactly what it saw.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

/** The router, mounted where `server.ts` mounts it — the shape `test/thesis/publicReads.test.ts` :40–:45 uses. */
async function app(): Promise<ReturnType<typeof express>> {
  const { publicThesisRouter } = await built<{ publicThesisRouter: Router }>('routes/publicThesisRoutes');
  const server = express();
  server.use('/api/thesis', publicThesisRouter);
  return server;
}

/** The published world the body is read from: the thesis published at VERSION, its attempt on record. */
function seedPublished(over: Partial<typeof THESIS> = {}): void {
  seedThesis({ ...AS_PUBLISHED, ...over });
  store.attempts = [ATTEMPT];
}

async function provisionTitleOfBody(server: ReturnType<typeof express>): Promise<unknown> {
  const res = await request(server).get(`/api/thesis/${THESIS.id}`);
  expect(res.status).toBe(200);
  return (res.body as { provisionTitle?: unknown }).provisionTitle;
}

describe('the published body names its provision by the table entry', () => {
  it('GET /:id carries provisionTitle — the title the PROVISIONS table holds for the thesis’s provision, read from the table and never re-spelled, and null for a thesis with no provision (docs/gf-ui-flows.md §17 :529–:530; thesis A1 :1251–:1254)', async () => {
    const server = await app();

    // THE SAME OBJECT, widened — never a copy: the module under test reads this table.
    const table: Record<string, ProvisionShape> = PROVISIONS;
    jest.replaceProperty(table, PROVISION, { title: 'MARK-PROVISION-TITLE', elements: PROVISIONS[PROVISION].elements });

    seedPublished();
    const titled = await provisionTitleOfBody(server);

    seedPublished({ provision: null });
    const untitled = await provisionTitleOfBody(server);

    expect([titled, untitled]).toEqual(['MARK-PROVISION-TITLE', null]);
  });
});
