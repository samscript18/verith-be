import { MediaLiteracyCompetency } from '../../verifications/enums/guided-investigation.enum';
import { MilFindingTaxonomy } from '../enums/mil-finding-taxonomy.enum';

export interface MilCoachTemplate {
  skillFocus: string;
  whyItMatters: string;
  nextCheck: string;
  practiceQuestion: string;
  competency: MediaLiteracyCompetency;
  tags: string[];
}

const contextTemplate: MilCoachTemplate = {
  skillFocus: 'Restore the missing context',
  whyItMatters:
    'A true detail can still mislead when its date, place, comparison, or original framing is removed.',
  nextCheck:
    'Find the earliest available version and compare its date, caption, location, and surrounding material.',
  practiceQuestion:
    'Which missing detail would most change how a reasonable person understands this content?',
  competency: MediaLiteracyCompetency.CONTEXT_RECOGNITION,
  tags: ['context', 'date', 'source-checking'],
};

const emotionTemplate: MilCoachTemplate = {
  skillFocus: 'Pause when a message pushes emotion',
  whyItMatters:
    'Urgency, fear, anger, and social pressure can shorten the time people spend checking a claim.',
  nextCheck:
    'Rewrite the claim without emotional language, then look for the original source and independent evidence.',
  practiceQuestion:
    'If the emotional wording disappeared, what factual statement would still need evidence?',
  competency: MediaLiteracyCompetency.MANIPULATION_RECOGNITION,
  tags: ['manipulation', 'emotional-language', 'responsible-sharing'],
};

export const MIL_COACH_TEMPLATES: Record<MilFindingTaxonomy, MilCoachTemplate> =
  {
    [MilFindingTaxonomy.ARTIFICIAL_URGENCY]: emotionTemplate,
    [MilFindingTaxonomy.FEAR]: emotionTemplate,
    [MilFindingTaxonomy.ANGER]: emotionTemplate,
    [MilFindingTaxonomy.SOCIAL_PRESSURE]: emotionTemplate,
    [MilFindingTaxonomy.CALL_TO_VIRALITY]: emotionTemplate,
    [MilFindingTaxonomy.FALSE_AUTHORITY]: {
      ...emotionTemplate,
      skillFocus: 'Verify the claimed authority',
      nextCheck:
        'Open the named organization’s official channel and look for the original statement or record.',
      competency: MediaLiteracyCompetency.SOURCE_IDENTIFICATION,
      tags: ['source-checking', 'authority', 'impersonation'],
    },
    [MilFindingTaxonomy.MISSING_DATE]: contextTemplate,
    [MilFindingTaxonomy.MISSING_LOCATION]: contextTemplate,
    [MilFindingTaxonomy.MISSING_BASELINE]: contextTemplate,
    [MilFindingTaxonomy.QUOTE_TRUNCATION]: contextTemplate,
    [MilFindingTaxonomy.OLD_CONTENT_PRESENTED_AS_CURRENT]: contextTemplate,
    [MilFindingTaxonomy.HEADLINE_MISMATCH]: contextTemplate,
    [MilFindingTaxonomy.SOURCE_IMPERSONATION]: {
      ...contextTemplate,
      skillFocus: 'Confirm who really published it',
      competency: MediaLiteracyCompetency.SOURCE_IDENTIFICATION,
      tags: ['source-checking', 'impersonation'],
    },
    [MilFindingTaxonomy.LACK_OF_INDEPENDENT_EVIDENCE]: {
      skillFocus: 'Look for genuinely independent confirmation',
      whyItMatters:
        'Several pages repeating one original claim are still one evidence chain, not several independent confirmations.',
      nextCheck:
        'Trace each source to its origin and find a second source that gathered or verified the facts independently.',
      practiceQuestion:
        'Do these sources know the claim separately, or are they all repeating the same origin?',
      competency: MediaLiteracyCompetency.SOURCE_INDEPENDENCE,
      tags: ['source-independence', 'evidence', 'source-checking'],
    },
    [MilFindingTaxonomy.UNSUPPORTED_STATISTICS]: {
      ...contextTemplate,
      skillFocus: 'Interrogate the number',
      nextCheck:
        'Find the dataset, sample size, timeframe, and comparison baseline behind the statistic.',
      competency: MediaLiteracyCompetency.EVIDENCE_EVALUATION,
      tags: ['statistics', 'evidence', 'baseline'],
    },
    [MilFindingTaxonomy.AI_MEDIA_UNCERTAINTY]: {
      skillFocus: 'Treat AI-media indicators as clues, not proof',
      whyItMatters:
        'Model-assisted media observations are probabilistic and cannot establish authorship or authenticity by themselves.',
      nextCheck:
        'Trace the media to its earliest source, inspect context, and seek corroborating records before making an authenticity claim.',
      practiceQuestion:
        'What evidence besides an AI indicator would be needed to support an authenticity conclusion?',
      competency: MediaLiteracyCompetency.AI_CONTENT_CAUTION,
      tags: ['ai-media', 'visual-verification', 'media-literacy'],
    },
    [MilFindingTaxonomy.SCREENSHOT_CONTEXT_LOSS]: {
      ...contextTemplate,
      skillFocus: 'Recover what the screenshot leaves out',
      competency: MediaLiteracyCompetency.VISUAL_VERIFICATION,
      tags: ['screenshots', 'visual-verification', 'context'],
    },
    [MilFindingTaxonomy.AUDIO_UNCERTAINTY]: {
      skillFocus: 'Verify a voice note beyond the voice',
      whyItMatters:
        'A transcript preserves words, but it may not establish the speaker, date, location, or original recording context.',
      nextCheck:
        'Check the earliest sender, named people or institutions, dates, and independent confirmation of the spoken claims.',
      practiceQuestion:
        'Which part of this voice note can be checked without assuming who the speaker is?',
      competency: MediaLiteracyCompetency.AUDIO_VIDEO_CAUTION,
      tags: ['audio', 'voice-notes', 'source-checking'],
    },
    [MilFindingTaxonomy.VIDEO_CONTEXT_MISMATCH]: {
      ...contextTemplate,
      skillFocus: 'Separate what the clip shows from what the caption claims',
      competency: MediaLiteracyCompetency.AUDIO_VIDEO_CAUTION,
      tags: ['video', 'visual-verification', 'context'],
    },
    [MilFindingTaxonomy.EVIDENCE_EVALUATION]: {
      skillFocus: 'Match confidence to the available evidence',
      whyItMatters:
        'A careful conclusion stays open about uncertainty when sources are incomplete, inaccessible, or conflicting.',
      nextCheck:
        'Inspect the strongest source, the main limitation, and what new evidence could change the finding.',
      practiceQuestion:
        'What is the strongest conclusion the available evidence supports without going further?',
      competency: MediaLiteracyCompetency.EVIDENCE_EVALUATION,
      tags: ['evidence', 'confidence', 'source-checking'],
    },
  };
