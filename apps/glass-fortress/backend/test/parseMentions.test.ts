import { parseMentions, ParsedMention } from '../src/utils/parseMentions';

// Helpers for building minimal TipTap nodes
const doc = (...content: object[]) => ({ type: 'doc', content });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const text = (value: string) => ({ type: 'text', text: value });

const keyFigureMention = (id: string) => ({
  type: 'keyFigureMention',
  attrs: { id, label: id },
});
const evidenceMention = (id: string) => ({
  type: 'evidenceMention',
  attrs: { id, label: `Evidence ${id}` },
});
const trackedUrlMention = (id: string) => ({
  type: 'trackedUrlMention',
  attrs: { id, label: `URL ${id}` },
});

describe('parseMentions', () => {
  describe('empty / no mentions', () => {
    it('returns empty array for a doc with only text', () => {
      const result = parseMentions(doc(paragraph(text('No mentions here'))));
      expect(result).toEqual([]);
    });

    it('returns empty array for an empty doc', () => {
      expect(parseMentions(doc())).toEqual([]);
    });
  });

  describe('mention extraction', () => {
    it('extracts a keyFigureMention node', () => {
      const result = parseMentions(
        doc(paragraph(text('About '), keyFigureMention('Netanyahu'))),
      );
      expect(result).toEqual<ParsedMention[]>([
        { type: 'KEY_FIGURE', refId: 'Netanyahu' },
      ]);
    });

    it('extracts an evidenceMention node', () => {
      const hash = 'abc123deadbeef';
      const result = parseMentions(doc(paragraph(evidenceMention(hash))));
      expect(result).toEqual<ParsedMention[]>([
        { type: 'EVIDENCE', refId: hash },
      ]);
    });

    it('extracts a trackedUrlMention node', () => {
      const urlId = 'uuid-tracked-url-1';
      const result = parseMentions(doc(paragraph(trackedUrlMention(urlId))));
      expect(result).toEqual<ParsedMention[]>([
        { type: 'TRACKED_URL', refId: urlId },
      ]);
    });

    it('extracts all three mention types from the same doc', () => {
      const result = parseMentions(
        doc(
          paragraph(
            keyFigureMention('Fauci'),
            text(' cited in '),
            evidenceMention('hash-001'),
            text(' see also '),
            trackedUrlMention('url-id-001'),
          ),
        ),
      );
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ type: 'KEY_FIGURE', refId: 'Fauci' });
      expect(result).toContainEqual({ type: 'EVIDENCE', refId: 'hash-001' });
      expect(result).toContainEqual({ type: 'TRACKED_URL', refId: 'url-id-001' });
    });
  });

  describe('deduplication', () => {
    it('deduplicates the same keyFigure mentioned twice', () => {
      const result = parseMentions(
        doc(
          paragraph(keyFigureMention('Netanyahu')),
          paragraph(text('Again: '), keyFigureMention('Netanyahu')),
        ),
      );
      expect(result).toEqual<ParsedMention[]>([
        { type: 'KEY_FIGURE', refId: 'Netanyahu' },
      ]);
    });

    it('does not deduplicate same refId with different types', () => {
      // Same string used as both a KEY_FIGURE and EVIDENCE refId (edge case)
      const result = parseMentions(
        doc(
          paragraph(
            keyFigureMention('shared-id'),
            evidenceMention('shared-id'),
          ),
        ),
      );
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ type: 'KEY_FIGURE', refId: 'shared-id' });
      expect(result).toContainEqual({ type: 'EVIDENCE', refId: 'shared-id' });
    });
  });

  describe('nesting', () => {
    it('extracts mentions from deeply nested content', () => {
      const result = parseMentions({
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [paragraph(keyFigureMention('DeepFigure'))],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(result).toEqual<ParsedMention[]>([
        { type: 'KEY_FIGURE', refId: 'DeepFigure' },
      ]);
    });

    it('extracts mentions from multiple paragraphs', () => {
      const result = parseMentions(
        doc(
          paragraph(keyFigureMention('PersonA')),
          paragraph(keyFigureMention('PersonB')),
          paragraph(evidenceMention('hash-A')),
        ),
      );
      expect(result).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    it('ignores mention nodes with a missing attrs.id', () => {
      const result = parseMentions(
        doc(paragraph({ type: 'keyFigureMention', attrs: {} })),
      );
      expect(result).toEqual([]);
    });

    it('ignores mention nodes with an empty string attrs.id', () => {
      const result = parseMentions(
        doc(paragraph({ type: 'keyFigureMention', attrs: { id: '   ' } })),
      );
      expect(result).toEqual([]);
    });

    it('ignores unknown node types', () => {
      const result = parseMentions(
        doc(paragraph({ type: 'customWidget', attrs: { id: 'x' } })),
      );
      expect(result).toEqual([]);
    });

    it('throws a ZodError for a non-object document', () => {
      expect(() => parseMentions('not a document')).toThrow();
      expect(() => parseMentions(null)).toThrow();
      expect(() => parseMentions(42)).toThrow();
    });

    it('throws a ZodError when type field is missing', () => {
      expect(() => parseMentions({ content: [] })).toThrow();
    });

    it('maps a trajectoryMention to CLAIM_TRAJECTORY, keeping the ClaimTrajectory id', () => {
      // The refId is a row id, not a claimHash: it pins the detection pass, so
      // the citation resolves permanently to what was cited.
      const result = parseMentions(
        doc(paragraph({ type: 'trajectoryMention', attrs: { id: 'ckm-traj-1', label: 'Claim text' } })),
      );
      expect(result).toEqual([{ type: 'CLAIM_TRAJECTORY', refId: 'ckm-traj-1' }]);
    });
  });
});
