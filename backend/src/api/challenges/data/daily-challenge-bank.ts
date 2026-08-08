import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';

export const DAILY_CHALLENGE_QUESTIONS = [
  {
    id: 'daily-01',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt:
      'A post says “share before they delete this.” What should you do first?',
    options: [
      { id: 'a', text: 'Pause and identify the original source' },
      { id: 'b', text: 'Forward it so the warning is preserved' },
      { id: 'c', text: 'Trust it because it sounds urgent' },
    ],
    correctOptionIds: ['a'],
    explanation:
      'Urgency is not evidence. Find the original source before sharing.',
  },
  {
    id: 'daily-02',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt: 'Which source gives the strongest support for a new public policy?',
    options: [
      { id: 'a', text: 'An undated screenshot' },
      { id: 'b', text: 'The responsible agency’s dated publication' },
      { id: 'c', text: 'A friend repeating the headline' },
    ],
    correctOptionIds: ['b'],
    explanation:
      'A dated primary publication is directly inspectable and attributable.',
  },
  {
    id: 'daily-03',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt: 'Why should you check the date on a true photograph?',
    options: [
      {
        id: 'a',
        text: 'Old real images can be reused with a false current caption',
      },
      { id: 'b', text: 'Dates prove every caption is accurate' },
      { id: 'c', text: 'A real image never needs context' },
    ],
    correctOptionIds: ['a'],
    explanation:
      'Authentic media can still mislead when time or place is changed.',
  },
  {
    id: 'daily-04',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt:
      'Two articles repeat the same anonymous claim. Are they independent evidence?',
    options: [
      { id: 'a', text: 'Always' },
      { id: 'b', text: 'Only if they independently verified it' },
      { id: 'c', text: 'Yes, because there are two links' },
    ],
    correctOptionIds: ['b'],
    explanation:
      'Several pages can share one unverified origin and remain one evidence lineage.',
  },
  {
    id: 'daily-05',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt: 'What does “insufficient evidence” mean?',
    options: [
      { id: 'a', text: 'The claim is definitely false' },
      { id: 'b', text: 'The claim is definitely true' },
      {
        id: 'c',
        text: 'The available evidence cannot support a firm decision',
      },
    ],
    correctOptionIds: ['c'],
    explanation:
      'Unresolved is a distinct finding and must not be rewritten as false.',
  },
  {
    id: 'daily-06',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt:
      'A screenshot cuts off the account name and timestamp. What is missing?',
    options: [
      { id: 'a', text: 'Only decoration' },
      { id: 'b', text: 'Source and time context needed to assess the claim' },
      { id: 'c', text: 'Nothing important' },
    ],
    correctOptionIds: ['b'],
    explanation:
      'Cropping can remove who said something, when, and in what conversation.',
  },
  {
    id: 'daily-07',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt:
      'A voice note names no speaker or document. What is the safest conclusion?',
    options: [
      {
        id: 'a',
        text: 'Treat it as confirmed because the voice sounds confident',
      },
      { id: 'b', text: 'Treat the identity and claim as unverified' },
      { id: 'c', text: 'Assume it came from an insider' },
    ],
    correctOptionIds: ['b'],
    explanation:
      'Tone cannot establish identity, authority, or factual support.',
  },
  {
    id: 'daily-08',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt: 'Which action best checks a quoted statistic?',
    options: [
      { id: 'a', text: 'Find the original dataset and its definition' },
      { id: 'b', text: 'Count how many reactions the post has' },
      { id: 'c', text: 'Trust the largest number in the graphic' },
    ],
    correctOptionIds: ['a'],
    explanation:
      'A statistic needs its original measure, population, date, and method.',
  },
  {
    id: 'daily-09',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt: 'What should you do when a publisher blocks automated access?',
    options: [
      { id: 'a', text: 'Invent the missing article content' },
      {
        id: 'b',
        text: 'Record the access limitation and inspect another lawful source',
      },
      { id: 'c', text: 'Call the claim false immediately' },
    ],
    correctOptionIds: ['b'],
    explanation:
      'Access failure is a limitation, not evidence for or against the claim.',
  },
  {
    id: 'daily-10',
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt:
      'Before sharing a high-impact claim, which question is most useful?',
    options: [
      { id: 'a', text: 'Does this agree with what I already believe?' },
      { id: 'b', text: 'What evidence would change my conclusion?' },
      { id: 'c', text: 'Will this get attention quickly?' },
    ],
    correctOptionIds: ['b'],
    explanation:
      'A falsifiable check helps separate evidence-based reasoning from confirmation bias.',
  },
] as const;
