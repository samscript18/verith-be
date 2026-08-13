import { geminiThinkingConfig } from './gemini-thinking';

describe('Gemini thinking configuration', () => {
  it('bounds Gemini 2.5 Flash reasoning for structured work', () => {
    expect(geminiThinkingConfig('gemini-2.5-flash', 'none')).toEqual({
      thinkingBudget: 0,
    });
    expect(geminiThinkingConfig('gemini-2.5-flash', 'minimal')).toEqual({
      thinkingBudget: 128,
    });
    expect(geminiThinkingConfig('gemini-2.5-flash', 'low')).toEqual({
      thinkingBudget: 1024,
    });
  });

  it('does not send unsupported thinking options to unknown model families', () => {
    expect(geminiThinkingConfig('configured-model', 'low')).toBeUndefined();
  });

  it('uses the documented minimum when Gemini 2.5 Pro cannot disable thinking', () => {
    expect(geminiThinkingConfig('gemini-2.5-pro', 'none')).toEqual({
      thinkingBudget: 128,
    });
  });
});
