import { ChallengeDifficulty } from '../enums/challenge.enum';
import {
  DailyChallengeCompetency,
  DailyChallengeTopic,
} from '../enums/daily-challenge.enum';
import type { DailyChallengeBlueprint } from '../interfaces/daily-challenge.interface';
import {
  DAILY_COMPETENCY_SEQUENCE,
  DAILY_TOPICS,
} from './daily-challenge-bank';

const DAILY_THEMES = [
  'Check the Source',
  'Spot the Missing Context',
  'Evidence Before Conclusion',
  'Think Before You Share',
  'Trace the Original',
  'Pause and Verify',
  'Read Beyond the Headline',
  'Separate Claim from Evidence',
] as const;

function utcDayNumber(dateKey: string): number {
  const value = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(value))
    throw new Error('Daily challenge date is invalid');
  return Math.floor(value / 86_400_000);
}

export function buildDailyChallengeBlueprint(
  dateKey: string,
): DailyChallengeBlueprint {
  const day = Math.abs(utcDayNumber(dateKey));
  const primaryIndex = day % DAILY_TOPICS.length;
  let secondaryIndex =
    (day * 7 + Math.floor(day / 7) + 5) % DAILY_TOPICS.length;
  if (secondaryIndex === primaryIndex)
    secondaryIndex = (secondaryIndex + 1) % DAILY_TOPICS.length;
  const topicFocus = [
    DAILY_TOPICS[primaryIndex]!.code,
    DAILY_TOPICS[secondaryIndex]!.code,
  ];
  const competencyTargets: DailyChallengeCompetency[] = [
    ...DAILY_COMPETENCY_SEQUENCE,
  ];
  if (topicFocus.includes(DailyChallengeTopic.AI_GENERATED_CONTENT)) {
    competencyTargets[7] = DailyChallengeCompetency.AI_CONTENT_CAUTION;
  } else if (
    topicFocus.some((topic) =>
      [DailyChallengeTopic.IMAGES_VIDEO].includes(topic),
    )
  ) {
    competencyTargets[7] = DailyChallengeCompetency.VISUAL_VERIFICATION;
  } else if (topicFocus.includes(DailyChallengeTopic.VOICE_NOTES)) {
    competencyTargets[7] = DailyChallengeCompetency.AUDIO_VIDEO_CAUTION;
  }

  return {
    date: dateKey,
    difficulty: ChallengeDifficulty.BEGINNER,
    topicFocus,
    competencyTargets,
    questionCount: 10,
    language: 'en',
    theme: DAILY_THEMES[day % DAILY_THEMES.length]!,
  };
}
