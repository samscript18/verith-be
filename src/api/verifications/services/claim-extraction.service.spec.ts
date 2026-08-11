import { ClaimExtractionService } from './claim-extraction.service';

describe('ClaimExtractionService screenshot source spans', () => {
  const service = new ClaimExtractionService(
    {} as never,
    {
      normalizeClaim: (value: string) => value.trim().toLowerCase(),
    } as never,
    {} as never,
    { getOrThrow: () => ({}) } as never,
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
});
