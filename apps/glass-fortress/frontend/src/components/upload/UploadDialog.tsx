'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import { GLYPHS } from '@/components/glyphs';
import { useAuth } from '@/context/AuthContext';
import { Link, useRouter } from '@/i18n/navigation';
import { docIdOf } from '@/lib/documentHash';
import { formatDate } from '@/lib/format';
import { returnToOf } from '@/lib/researchFetch';
import { putToSignedUrl, requestUploadUrl, type UploadRefusal } from '@/lib/uploadApi';
import { addDocumentCommand, type AddDocumentCommand, type ReadyLink, type UploadLink } from '@/lib/uploadLink';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG — boards י1 · י1ב · י2 of `docs/boards/gf-ui-boards-2026-09-22.html`; docs/gf-document-flows.md
// §9 :998; docs/gf-ui-flows.md §1 :39 (a DIALOG), A1 :1129 (its one route), A2 :1150–:1151 (401, 403).
//
// TOP TO BOTTOM, THE BOARD'S ORDER: the heading · the one sentence · THE LABELS (every fact the link brought, as
// TEXT, never an input) · the drop zone and its strip · the file row · the status pill · the command and its copy ·
// the closing line. It takes ONE thing, the file; the browser computes DOC_ID over it as given, asks the dialog's
// route for a signed URL, PUTs the file, and hands back the `add_document` command. IT NEVER MAKES THE ACT — the
// command is run in the conversation, which is where every write is attributed (ui §1 :32–:34).
//
// THE GATE. Signed out, the reader is sent to `/login?returnTo=` this dialog, bare and with its link, and nothing is
// drawn on the way (the read view's own 401, `ResearchDoor`). The route's 403 is the read view's one ruled sentence
// with `/researchers` linked — the same two messages, one spelling. The client cannot tell a non-researcher from a
// researcher before it asks, and the ONE request that asks is the route's POST; so the 403 is said when it answers.
//
// NO HASH AS TEXT (ui §4 :168): DOC_ID and a derived-from commitment appear only inside the command and its copy.
// ---------------------------------------------------------------------------

type Step =
  | { step: 'CHOOSING' }
  | { step: 'HASHING'; file: File }
  | { step: 'UPLOADING'; file: File }
  | { step: 'UPLOADED'; file: File; command: AddDocumentCommand }
  | { step: 'STORED'; file: File; command: AddDocumentCommand }
  | { step: 'REFUSED'; file: File; code: UploadRefusal }
  | { step: 'FAILED'; file: File }
  | { step: 'OFFLINE'; file: File }
  | { step: 'FORBIDDEN' }
  | { step: 'SIGNED_OUT' };

function sizeOf(bytes: number, locale: string): string {
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (bytes >= 1024 * 1024) return `${format(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${format(bytes / 1024)} KB`;
  return `${String(bytes)} B`;
}

export function UploadDialog({ link }: { link: UploadLink }) {
  const t = useTranslations('upload');
  const { accessToken, loading } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<Step>({ step: 'CHOOSING' });
  const signedOut = (!loading && accessToken === null) || state.step === 'SIGNED_OUT';

  useEffect(() => {
    if (!signedOut) return;
    router.push(`/login?returnTo=${encodeURIComponent(returnToOf(window.location))}`);
  }, [signedOut, router]);

  if (signedOut || loading) return null;
  if (link.state === 'MALFORMED') return <DialogBody><p className="text-sm text-ink">{t('malformed', { key: link.key })}</p></DialogBody>;
  if (link.state === 'NO_TITLE') return <DialogBody><p className="text-sm text-ink">{t('noTitle')}</p></DialogBody>;
  if (state.step === 'FORBIDDEN') return <DialogBody><Forbidden /></DialogBody>;

  const choose = async (file: File): Promise<void> => {
    setState({ step: 'HASHING', file });
    const docId = await docIdOf(new Uint8Array(await file.arrayBuffer()));
    setState({ step: 'UPLOADING', file });
    const signed = await requestUploadUrl({ docId, mimeType: file.type, byteLength: file.size });
    if (signed.state === 'SIGNED_OUT') return setState({ step: 'SIGNED_OUT' });
    if (signed.state === 'NOT_A_RESEARCHER') return setState({ step: 'FORBIDDEN' });
    if (signed.state === 'UNREACHABLE') return setState({ step: 'OFFLINE', file });
    if (signed.state === 'REFUSED') return setState({ step: 'REFUSED', file, code: signed.code });
    // THE BYTES ARE ALREADY IN THE STORE (§9 :998 as ruled 2026-09-23, F2): nothing is re-sent, and the command is the
    // same one — `add_document` answers `existed: true` for a document it already holds.
    if (signed.state === 'STORED') return setState({ step: 'STORED', file, command: addDocumentCommand({ docId, mimeType: file.type }, link) });
    const put = await putToSignedUrl(signed.uploadUrl, file, file.type);
    if (put === 'FAILED') return setState({ step: 'FAILED', file });
    setState({ step: 'UPLOADED', file, command: addDocumentCommand({ docId, mimeType: file.type }, link) });
  };

  return (
    <DialogBody>
      <Labels link={link} />
      {state.step === 'CHOOSING' ? (
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-ink-muted bg-surface px-4 py-6 text-center text-sm">
          <span>{t('drop')}</span>
          <span className="text-mark text-ink-muted">{t('strip')}</span>
          <input
            type="file"
            className="sr-only"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.item(0) ?? null;
              if (file === null) return;
              // ANY FAILURE NOT NAMED BY A STATE IS THE FAILED STATE (R78 chunk-3 round 2, MEDIUM 1). `uploadApi`
              // throws on an answer no approved state names, and the browser can refuse to read a file; either,
              // escaping here, was an unhandled rejection that left „מעלה…" on the page for ever. The cause is
              // logged loudly, and the researcher is told the one failure sentence.
              choose(file).catch((cause: unknown) => {
                console.error('upload dialog: the upload failed on an answer no state names', cause);
                setState({ step: 'FAILED', file });
              });
            }}
          />
        </label>
      ) : (
        <Progress state={state} />
      )}
    </DialogBody>
  );
}

function DialogBody({ children }: { children: React.ReactNode }) {
  const t = useTranslations('upload');
  return (
    <main className="mx-auto flex w-full max-w-[var(--reading-column)] flex-col gap-4 px-4 py-6">
      <h1 className="text-[1.125rem] font-semibold text-ink">{t('title')}</h1>
      <p className="text-mark text-ink-muted">{t('sentence')}</p>
      {children}
    </main>
  );
}

function Forbidden() {
  const t = useTranslations('research.state');
  return (
    <p data-upload-forbidden className="text-sm text-ink">
      {t('forbidden')}{' '}
      <Link href="/researchers" className="underline">
        {t('forbiddenLink')}
      </Link>
    </p>
  );
}

/** Every fact the link brought, as TEXT — a label it did not bring is not drawn (§9 :998, boards י1 and י1ב). */
function Labels({ link }: { link: ReadyLink }) {
  const t = useTranslations('upload.labels');
  // The strip's own word for each family — `test/uploadLink.test.ts` holds every one to appear in the strip.
  const family = useTranslations('upload.family');
  const locale = useLocale();
  const rows: [string, React.ReactNode][] = [[t('title'), <bdi key="title">{link.title}</bdi>]];
  if (link.derivedFrom !== null) {
    rows.push([
      t('derivedFrom'),
      <span key="derived" className="inline-flex items-center gap-1">
        {GLYPHS.version()}
        <bdi>{link.derivedFrom.title ?? ''}</bdi>
        {link.derivedFrom.family === null ? null : ` (${family(link.derivedFrom.family)})`}
      </span>,
    ]);
  }
  if (link.url !== null) rows.push([t('page'), <span key="page" dir="ltr" className="font-mono text-value">{link.url}</span>]);
  if (link.at !== null) rows.push([t('date'), formatDate(`${link.at}T00:00:00.000Z`, locale)]);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[10px] border border-line bg-paper-deep px-4 py-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="min-w-0 break-words font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Progress({ state }: { state: Exclude<Step, { step: 'CHOOSING' | 'FORBIDDEN' | 'SIGNED_OUT' }> }) {
  const t = useTranslations('upload');
  const marking = useTranslations('marking');
  const locale = useLocale();
  const pill = {
    HASHING: t('status.hashing'),
    UPLOADING: t('status.uploading'),
    UPLOADED: t('status.uploaded'),
    STORED: t('status.stored'),
    REFUSED: null,
    FAILED: null,
    OFFLINE: null,
  }[state.step];
  return (
    <>
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm">
        {GLYPHS.version()}
        <span dir="ltr" className="min-w-0 flex-1 truncate">{state.file.name}</span>
        <span className="text-mark text-ink-muted">{sizeOf(state.file.size, locale)}</span>
      </div>
      {pill === null ? null : (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-mark text-ink-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {pill}
        </span>
      )}
      {state.step === 'REFUSED' ? <p className="text-sm text-ink">{t(`refused.${state.code}`)}</p> : null}
      {state.step === 'FAILED' ? <p className="text-sm text-ink">{t('failed')}</p> : null}
      {state.step === 'OFFLINE' ? <p className="text-sm text-ink">{marking('offline')}</p> : null}
      {state.step === 'UPLOADED' || state.step === 'STORED' ? <Command command={state.command} /> : null}
    </>
  );
}

function Command({ command }: { command: AddDocumentCommand }) {
  const t = useTranslations('upload');
  return (
    <>
      <p className="text-label font-semibold text-ink-muted">{t('commandLabel')}</p>
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-ink px-3 py-2">
        <code data-upload-command dir="ltr" className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-value text-paper">
          {command.before}&quot;<bdi>{command.title}</bdi>&quot;{command.after}
        </code>
        {/* The one copy control (`CopyableCode`), recoloured for the dark block it sits on — board י1's corner icon. */}
        <span className="shrink-0 [&_button]:border-ink-muted [&_button]:text-paper [&_button:hover]:bg-ink">
          <CopyableCode value={command.text} label={t('copy')} />
        </span>
      </div>
      <p className="text-mark text-ink-muted">{t('closing')}</p>
    </>
  );
}
