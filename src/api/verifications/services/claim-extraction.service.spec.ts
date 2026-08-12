import { ClaimExtractionService } from './claim-extraction.service';
import { ClaimQuerySource } from '../schemas/claim.schema';
import { SearchQueryCategory } from '../enums/claim.enum';

describe('ClaimExtractionService screenshot source spans', () => {
  const service = new ClaimExtractionService(
    {} as never,
    {
      normalizeClaim: (value: string) => value.trim().toLowerCase(),
    } as never,
    {} as never,
    { getOrThrow: () => ({ maxQueriesPerClaim: 2 }) } as never,
  );
  const resolver = service as unknown as {
    resolveSourceSpan(
      content: string,
      claim: {
        text: string;
        sourceSpan: { start: number; end: number };
      },
    ): { start: number; end: number } | null;
  };

  it('repairs incorrect model offsets when OCR punctuation and spacing vary', () => {
    const content =
      'PUBLIC NOTICE — All district schools will reopen on Monday, 12 August.';
    const span = resolver.resolveSourceSpan(content, {
      text: 'All district schools will reopen on Monday 12 August',
      sourceSpan: { start: 0, end: 10 },
    });

    expect(span).not.toBeNull();
    expect(content.slice(span!.start, span!.end)).toContain('All district');
  });

  it('rejects a hallucinated claim that is not grounded in screenshot text', () => {
    expect(
      resolver.resolveSourceSpan('Community meeting begins at noon.', {
        text: 'The government cancelled all elections',
        sourceSpan: { start: 0, end: 12 },
      }),
    ).toBeNull();
  });

  it('creates one original-language and one canonical-English query without duplicates', () => {
    const multilingual = service as unknown as {
      multilingualQueries(
        claim: { text: string; canonicalText: string },
        sourceLanguage: string,
        generated: Array<{
          query: string;
          category: SearchQueryCategory;
          language: string;
          source: ClaimQuerySource;
        }>,
      ): Array<{ query: string; language: string; source: ClaimQuerySource }>;
    };
    const queries = multilingual.multilingualQueries(
      {
        text: 'Ìkéde náà sọ pé ilé-ẹ̀kọ́ yóò ti ilẹ̀kùn.',
        canonicalText: 'The announcement says the school will close.',
      },
      'yo',
      [
        {
          query: 'Ìkéde ilé-ẹ̀kọ́ yóò ti ilẹ̀kùn',
          category: SearchQueryCategory.ORIGINAL_SOURCE,
          language: 'yo',
          source: ClaimQuerySource.ORIGINAL_CLAIM,
        },
        {
          query: 'school closure official announcement',
          category: SearchQueryCategory.OFFICIAL,
          language: 'en',
          source: ClaimQuerySource.CANONICAL_CLAIM,
        },
        {
          query: 'school closure official announcement',
          category: SearchQueryCategory.OFFICIAL,
          language: 'en',
          source: ClaimQuerySource.CANONICAL_CLAIM,
        },
      ],
    );

    expect(queries).toHaveLength(2);
    expect(queries.map((query) => query.language)).toEqual(['yo', 'en']);
    expect(queries.map((query) => query.source)).toEqual([
      ClaimQuerySource.ORIGINAL_CLAIM,
      ClaimQuerySource.CANONICAL_CLAIM,
    ]);
  });
});
