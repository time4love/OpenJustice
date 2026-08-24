// ---------------------------------------------------------------------------
// Provenance event labels — Prisma enum <-> frontend message catalogs.
//
// The provenance timeline renders every event through
// t(`provenance.events.${event.type}`). An event type added to
// ResearchSessionEventType and forgotten in messages/{he,en}.json is therefore
// a timeline entry that renders as its own translation key — on the one page
// whose entire purpose is that the record of how a thesis came to be cannot be
// quietly incomplete.
//
// Same reasoning as reportLabelParity.test.ts, and the same boundary no
// compiler crosses. Set-equal rather than ordered: unlike the intake form's
// radio buttons, these labels are looked up by key and the timeline's order
// comes from createdAt, not from declaration order.
//
// Also pins the backend's own ProvenanceEventType union to the enum. That union
// is hand-written in services/thesisProvenance.ts so the API surface is
// explicit rather than leaking a Prisma type to HTTP clients — which means it,
// too, can silently fall behind.
// ---------------------------------------------------------------------------

import { ResearchSessionEventType } from '@prisma/client';
import en from '../../frontend/messages/en.json';
import he from '../../frontend/messages/he.json';
import type { ProvenanceEventType } from '../src/services/thesisProvenance';

const CATALOGS: [locale: string, messages: typeof en | typeof he][] = [
  ['en', en],
  ['he', he],
];

const EXPECTED = Object.values(ResearchSessionEventType).sort();

describe('provenance event labels', () => {
  it.each(CATALOGS)('%s labels every ResearchSessionEventType', (_locale, messages) => {
    const events = (messages.theses as unknown as { provenance: { events: Record<string, string> } })
      .provenance.events;

    expect(Object.keys(events).sort()).toEqual(EXPECTED);
  });

  it.each(CATALOGS)('%s has no empty provenance label', (_locale, messages) => {
    const provenance = (messages.theses as unknown as { provenance: Record<string, unknown> }).provenance;

    for (const [key, value] of Object.entries(provenance)) {
      if (key === 'events') continue;
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('the API-facing union covers exactly the enum', () => {
    // Compile-time in both directions: an enum member missing from the union
    // fails to assign, and a union member that is not an enum value fails too.
    const fromEnum: Record<ResearchSessionEventType, ProvenanceEventType> = {
      SESSION_STARTED: 'SESSION_STARTED',
      VERSION_CREATED: 'VERSION_CREATED',
      GAP_RESOLVED: 'GAP_RESOLVED',
      AI_ANALYSIS_RUN: 'AI_ANALYSIS_RUN',
      NOTE: 'NOTE',
      SESSION_CLOSED: 'SESSION_CLOSED',
      FRAMING_PROPOSED: 'FRAMING_PROPOSED',
      FRAMING_ASSESSED: 'FRAMING_ASSESSED',
      THESIS_ATTACHED: 'THESIS_ATTACHED',
      PUBLICATION_RATIONALE: 'PUBLICATION_RATIONALE',
      PUBLICATION_ASSESSED: 'PUBLICATION_ASSESSED',
      THESIS_PUBLISHED: 'THESIS_PUBLISHED',
      THESIS_UNPUBLISHED: 'THESIS_UNPUBLISHED',
      SESSION_CLOSED_BY_OTHER: 'SESSION_CLOSED_BY_OTHER',
    };

    expect(Object.keys(fromEnum).sort()).toEqual(EXPECTED);
  });

  it('the two locales describe the same things', () => {
    const keys = (m: typeof en | typeof he): string[] =>
      Object.keys((m.theses as unknown as { provenance: Record<string, unknown> }).provenance).sort();

    expect(keys(he)).toEqual(keys(en));
  });

  it('both locales carry the empty-state string that describes the VIEWER, not the world', () => {
    // Fix (b): one string for everyone told a public visitor there are no theses
    // while unpublished drafts existed — a false statement made to avoid a leak.
    for (const [, messages] of CATALOGS) {
      const theses = messages.theses as unknown as Record<string, unknown>;
      expect(typeof theses['emptyState']).toBe('string');
      expect(typeof theses['emptyStatePublic']).toBe('string');
      expect(theses['emptyState']).not.toEqual(theses['emptyStatePublic']);
    }
  });
});
