'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DOORS_OPEN } from '@/lib/doors';
import type { CallItem, Citation, RequestItem } from '@/types/thesis';
import { CitationChip } from './CitationChip';
import { LetterDialog } from './LetterDialog';
import { evidenceChipKind } from './Tick';
import { ResearcherWords } from './ResearcherWords';

// ---------------------------------------------------------------------------
// THE APPEALS — ON THE CALL PAGE ALONE. docs/gf-ui-flows.md §20 as amended 2026-09-16 (the legacy
// shape); docs/gf-ui-refactor-plan.md §10 :1122–:1125; canvas page 3 board A.
//
// REGION 4 IS GONE FROM THE THESIS PAGE (R56's ruling; design session §3 :73–:75): one card there leads
// here, and this is where the requests and the call live now.
//
// THE REQUEST IS A CARD, AND THE LETTER IS BEHIND A BUTTON. The request's TEXT is never rendered on the
// page and never handed to a copy control here — it reaches a reader only inside `LetterDialog`, and
// only resolved. That is R56's F3 closed by construction rather than by a substitution.
//
// DECISION 5 (design session §1.6): with ZERO called items „קריאה לעדים” is drawn MUTED and is NOT an
// anchor — `DOORS_OPEN` is false until the document plan's step 32 — with the body's own intake
// sentence under it. With called items it renders them as §17's cards.
//
// DECISION 4: the records a request rests on are DATED TICKS on the card, not in the letter. They are
// rendered through `CitationChip`, which carries `data-chip` and the tick inside it, so a record's
// 64-hex name is an attribute for the instruments and never a text node (§4 :167–:178).
//
// THE CALL AREA IS A SHAREABLE CALL TO ACTION (§20 as amended 2026-09-17; §10 :1127): what is being proved,
// WHAT IS MISSING, and what a reader can do. THE OBJECTIONS ARE NEVER SHOWN — what weakened the claim
// appears as what is missing, never as who objected (§16 :517–:521; §21 :621); `whatIsNeeded` on a CALLED
// item IS what is missing, and nothing new is read for it (thesis A5 :1567).
//
// THE DOOR IS WRITTEN AND NOT DRAWN (§20 :611; §17 :546–:548; §21 :622). `HowToReach` below renders the
// body's own intake sentence always and the CTA only while `lib/doors.ts`' `DOORS_OPEN` is true — the
// document plan's step 32 flips that one constant and nothing here moves. Same shape as the sidebar's
// `/safety` entry (`Sidebar.tsx` :137), and `lib/doors.ts` is KEEP: read, never edited.
// ---------------------------------------------------------------------------

export interface AppealsProps {
  call: readonly CallItem[];
  requests: readonly RequestItem[];
  intake: string;
  citations: readonly Citation[];
  pages: readonly { trackedUrlId: string; url: string }[];
  locale: string;
  headings: { call: string; requests: string; how: string };
}

/** A field of a card: its label, then the researcher's words, which are their own BLOCK (§16 :517–:521). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="appeal-field">
      <span className="appeal-field-label">{label}: </span>
      {children}
    </div>
  );
}

/**
 * §20 :611 — HOW: the body's own instruction, and then the door, which is not drawn until it exists.
 *
 * IT IS A BUTTON AND NOT AN ANCHOR. What the document plan's step 32 opens is the intake DIALOG
 * (document plan :229–:231), so there is no URL to point at — and pointing at one would be the anchor
 * `no-door-before-it-exists` forbids, correctly. The button is inert here by construction: while
 * `DOORS_OPEN` is false it is not rendered at all, so there is no handler to leave leading nowhere.
 *
 * ONE COMPONENT, BOTH BRANCHES, because "the intake sentence and then the door" is one rule and a copy of
 * it in each arm of the call/no-call ternary would be two.
 */
function HowToReach({ intake, label }: { intake: string; label: string }) {
  return (
    <>
      <ResearcherWords className="appeal-intake">
        <span data-intake>{intake}</span>
      </ResearcherWords>
      {DOORS_OPEN ? (
        <p>
          <button type="button" data-intake-cta className="appeal-button">
            {label}
          </button>
        </p>
      ) : null}
    </>
  );
}

function RequestCard({ request, citations, pages, locale }: { request: RequestItem; citations: readonly Citation[]; pages: readonly { trackedUrlId: string; url: string }[]; locale: string }) {
  const t = useTranslations('theses.appeals');
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <article className="appeal-card">
      <h3 className="appeal-card-title">{t('request')}</h3>
      <Field label={t('authority')}>
        <ResearcherWords>{request.authority}</ResearcherWords>
      </Field>
      <Field label={t('legalBasis')}>
        <ResearcherWords>{request.legalBasis}</ResearcherWords>
      </Field>
      <Field label={t('addresses')}>
        {request.addresses.map((address) => (
          <bdi dir="ltr" key={address} className="me-2">
            {address}
          </bdi>
        ))}
      </Field>
      <span data-rests-on className="appeal-rests-on">
        <span className="appeal-field-label">{t('restsOn')}: </span>
        {request.restsOn.map((name) => {
          const citation = citations.find((one) => one.kind === 'EVIDENCE' && one.name === name);
          return (
            <CitationChip
              key={name}
              kind={evidenceChipKind(citation)}
              name={name}
              source={`#ev_${name}`}
              citation={citation}
              pageId={citation?.kind === 'EVIDENCE' ? pages.find((page) => page.url === citation.record.url)?.trackedUrlId : undefined}
              locale={locale}
            />
          );
        })}
      </span>
      <p>
        <button
          type="button"
          id={`${id}-opener`}
          onClick={() => {
            setOpen(true);
          }}
          className="appeal-button"
        >
          {t('prepareLetter')}
        </button>
      </p>
      <LetterDialog request={request} open={open} onClose={() => { setOpen(false); }} openerId={`${id}-opener`} id={id} locale={locale} />
    </article>
  );
}

export function Appeals({ call, requests, intake, citations, pages, locale, headings }: AppealsProps) {
  const t = useTranslations('theses.appeals');
  const witnesses = useTranslations('theses');
  if (call.length === 0 && requests.length === 0) return null;

  return (
    <section className="space-y-4">
      {requests.length === 0 ? null : <h2 className="appeal-heading">{headings.requests}</h2>}
      {/* KEYED BY POSITION, because an appeal carries no id: thesis A2 :1325–:1327 shapes `callItem` and
          `request` with no gapId, and the body renders them in the order it sent. */}
      {requests.map((request, index) => (
        <RequestCard key={index} request={request} citations={citations} pages={pages} locale={locale} />
      ))}

      <h2 className="appeal-heading">{headings.how}</h2>
      {call.length === 0 ? (
        // DECISION 5: muted, and NOT an anchor.
        <div data-call-muted className="appeal-card appeal-card-muted">
          <h3 className="appeal-card-title">{witnesses('callForWitnessesBtn')}</h3>
          <HowToReach intake={intake} label={witnesses('callForWitnessesBtn')} />
        </div>
      ) : (
        <>
          {call.map((item, index) => (
            <article key={index} className="appeal-card">
              <h3 className="appeal-card-title">{t('call')}</h3>
              <Field label={t('whatIsNeeded')}>
                <ResearcherWords>{item.whatIsNeeded}</ResearcherWords>
              </Field>
              <Field label={t('whoWouldHaveSeenIt')}>
                <ResearcherWords>{item.whoWouldHaveSeenIt}</ResearcherWords>
              </Field>
              <Field label={t('unit')}>
                <ResearcherWords>{item.unit}</ResearcherWords>
              </Field>
              <Field label={t('window')}>
                <ResearcherWords>{item.window}</ResearcherWords>
              </Field>
            </article>
          ))}
          <HowToReach intake={intake} label={witnesses('callForWitnessesBtn')} />
        </>
      )}
    </section>
  );
}
