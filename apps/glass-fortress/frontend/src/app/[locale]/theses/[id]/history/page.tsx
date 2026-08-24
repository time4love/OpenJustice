import { redirect } from '@/i18n/navigation';

// ---------------------------------------------------------------------------
// /theses/:id/history — kept only so existing links still land somewhere.
//
// Version history used to be a page of its own, with its own bespoke header.
// Reaching it meant leaving the thesis behind and losing the view switcher, so
// the way back was a browser button rather than the control that had just been
// clicked. It is a third VIEW of the same thesis, so it now lives beside the
// other two and this route forwards to it.
// ---------------------------------------------------------------------------

export default async function ThesisHistoryRedirect({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  redirect({ href: `/theses/${id}?view=history`, locale });
}
