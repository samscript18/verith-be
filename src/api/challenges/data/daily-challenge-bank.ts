import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import {
  DailyChallengeCompetency,
  DailyChallengeTopic,
} from '../enums/daily-challenge.enum';

export interface DailyTopic {
  code: DailyChallengeTopic;
  name: string;
  scenario: string;
  primarySource: string;
  weakSignal: string;
  contextCheck: string;
  verificationAction: string;
  tags: string[];
}

export const DAILY_TOPICS: readonly DailyTopic[] = [
  {
    code: DailyChallengeTopic.PUBLIC_HEALTH,
    name: 'Public health claims',
    scenario: 'a widely forwarded health advisory',
    primarySource:
      'the dated guidance from the responsible public-health authority',
    weakSignal: 'an unnamed voice note that cites no document',
    contextCheck:
      'the affected population, publication date, and stated limitations',
    verificationAction:
      'compare the claim with current official guidance and independent clinical reporting',
    tags: ['public-health', 'source-checking', 'responsible-sharing'],
  },
  {
    code: DailyChallengeTopic.ELECTIONS,
    name: 'Election information',
    scenario: 'a post announcing a last-minute voting-rule change',
    primarySource:
      'the election authority’s dated notice and published procedure',
    weakSignal: 'a cropped partisan graphic with no source link',
    contextCheck:
      'the jurisdiction, election date, and people covered by the rule',
    verificationAction:
      'check the election authority and independent observers before sharing',
    tags: ['elections', 'civic-information', 'source-checking'],
  },
  {
    code: DailyChallengeTopic.CLIMATE_WEATHER,
    name: 'Climate and severe weather',
    scenario: 'a dramatic post about an approaching weather emergency',
    primarySource:
      'the national weather service’s timestamped alert and forecast map',
    weakSignal: 'an old storm image reposted without a location or date',
    contextCheck: 'the forecast area, issue time, confidence, and expiry time',
    verificationAction:
      'compare current official alerts with local reporting and observable conditions',
    tags: ['climate', 'weather', 'visual-context'],
  },
  {
    code: DailyChallengeTopic.EDUCATION,
    name: 'Schools and education',
    scenario: 'a message claiming schools will close or fees will change',
    primarySource:
      'the education authority’s dated circular or the school’s verified notice',
    weakSignal:
      'a forwarded message attributed only to “someone at the ministry”',
    contextCheck:
      'the schools affected, effective date, location, and official signatory',
    verificationAction:
      'check the responsible institution and a current independent report',
    tags: ['education', 'official-records', 'responsible-sharing'],
  },
  {
    code: DailyChallengeTopic.MONEY_SCAMS,
    name: 'Money and online scams',
    scenario:
      'a viral offer promising urgent financial help or investment returns',
    primarySource:
      'the regulator’s register and the named organisation’s verified terms',
    weakSignal: 'testimonials and reaction counts supplied by the promoter',
    contextCheck:
      'fees, eligibility, risk, contact domain, and withdrawal conditions',
    verificationAction:
      'verify the organisation independently and avoid using links supplied in the message',
    tags: ['scams', 'financial-literacy', 'source-checking'],
  },
  {
    code: DailyChallengeTopic.IMAGES_VIDEO,
    name: 'Images and short videos',
    scenario: 'a striking image or clip presented as a breaking local event',
    primarySource:
      'the earliest attributable publication and reliable reporting from the claimed location',
    weakSignal:
      'a caption, watermark, or reaction count added by the latest uploader',
    contextCheck:
      'the original date, location, crop, edit sequence, and creator',
    verificationAction:
      'separate what is visibly observable from what the caption claims',
    tags: ['images', 'video', 'context'],
  },
  {
    code: DailyChallengeTopic.SCIENCE_TECHNOLOGY,
    name: 'Science and technology',
    scenario:
      'a post claiming a new study or technology proves a dramatic result',
    primarySource: 'the original study, dataset, or technical documentation',
    weakSignal:
      'a confident summary that omits methods, sample size, and limitations',
    contextCheck:
      'the study design, population, comparison, date, and uncertainty',
    verificationAction:
      'read the original findings and compare qualified independent interpretation',
    tags: ['science', 'technology', 'evidence-evaluation'],
  },
  {
    code: DailyChallengeTopic.JOBS_RECRUITMENT,
    name: 'Jobs and recruitment',
    scenario: 'an urgent recruitment post requesting personal information',
    primarySource:
      'the employer’s verified careers page and official contact domain',
    weakSignal: 'a copied vacancy notice posted by an unnamed account',
    contextCheck:
      'the employer, role, deadline, domain, fees, and application method',
    verificationAction:
      'locate the vacancy through the employer’s own verified channels',
    tags: ['jobs', 'recruitment', 'scams'],
  },
  {
    code: DailyChallengeTopic.SCHOLARSHIPS,
    name: 'Scholarships and grants',
    scenario:
      'a scholarship message with a same-day deadline and no official page',
    primarySource:
      'the awarding institution’s current scholarship page and eligibility rules',
    weakSignal: 'a forwarded poster that asks readers to share before applying',
    contextCheck:
      'eligibility, deadline, award owner, application domain, and fees',
    verificationAction:
      'open the awarding institution’s site independently and compare the details',
    tags: ['scholarships', 'education', 'source-checking'],
  },
  {
    code: DailyChallengeTopic.BANKING_FINANCE,
    name: 'Banking and finance alerts',
    scenario:
      'a message claiming an account will be blocked unless a link is opened',
    primarySource:
      'the bank’s authenticated app, published security page, or verified support line',
    weakSignal: 'a shortened link and caller demanding immediate credentials',
    contextCheck:
      'the sender domain, requested information, destination URL, and urgency tactic',
    verificationAction:
      'contact the institution through a separately verified channel before acting',
    tags: ['banking', 'phishing', 'security'],
  },
  {
    code: DailyChallengeTopic.SECURITY_ALERTS,
    name: 'Digital security alerts',
    scenario:
      'a warning that urges users to install an unknown security update',
    primarySource:
      'the software vendor’s signed advisory and official update channel',
    weakSignal: 'an executable attachment sent from an unrelated address',
    contextCheck:
      'the affected product, version, advisory date, sender, and download origin',
    verificationAction:
      'check the vendor advisory and update only through the official product',
    tags: ['security', 'phishing', 'source-checking'],
  },
  {
    code: DailyChallengeTopic.AI_GENERATED_CONTENT,
    name: 'AI-generated content',
    scenario: 'a polished synthetic-looking post presented as direct evidence',
    primarySource:
      'the attributable original material and independent evidence of the claimed event',
    weakSignal: 'visual oddities treated as definitive proof of AI generation',
    contextCheck:
      'provenance, original publication, edits, corroboration, and uncertainty',
    verificationAction:
      'verify the underlying claim without relying on appearance alone',
    tags: ['ai-content', 'visual-context', 'evidence-evaluation'],
  },
  {
    code: DailyChallengeTopic.GOVERNMENT_NOTICES,
    name: 'Government notices',
    scenario: 'a circular claiming a new public rule takes effect immediately',
    primarySource:
      'the responsible agency’s dated publication or official gazette',
    weakSignal:
      'a logo-bearing document with no reference number or official location',
    contextCheck:
      'the issuing authority, reference, jurisdiction, date, and affected people',
    verificationAction:
      'locate the notice on the responsible agency’s verified publication channel',
    tags: ['government', 'official-records', 'date-checking'],
  },
  {
    code: DailyChallengeTopic.SOCIAL_MEDIA_RUMOURS,
    name: 'Social-media rumours',
    scenario:
      'a rapidly repeated claim whose posts all point back to one account',
    primarySource:
      'independent attributable reporting or a direct record relevant to the claim',
    weakSignal: 'many reposts that repeat the same unsupported wording',
    contextCheck:
      'the earliest source, independent confirmation, date, and original wording',
    verificationAction:
      'trace the claim to its origin and seek genuinely independent confirmation',
    tags: ['rumours', 'source-independence', 'responsible-sharing'],
  },
  {
    code: DailyChallengeTopic.VOICE_NOTES,
    name: 'Voice notes',
    scenario:
      'an anonymous voice note claiming insider knowledge of an emergency',
    primarySource:
      'an attributable recording plus a verifiable notice from the responsible body',
    weakSignal: 'the speaker’s confident tone and claim of unnamed contacts',
    contextCheck:
      'speaker identity, recording date, edits, location, and supporting records',
    verificationAction:
      'transcribe the factual claims and verify each through attributable sources',
    tags: ['audio', 'voice-notes', 'source-checking'],
  },
  {
    code: DailyChallengeTopic.NEWS_HEADLINES,
    name: 'News headlines',
    scenario: 'a dramatic headline shared without the article it summarizes',
    primarySource:
      'the complete dated article and any primary records it cites',
    weakSignal:
      'a cropped headline card detached from its publication and date',
    contextCheck:
      'the full article, publication date, headline wording, evidence, and corrections',
    verificationAction:
      'read beyond the headline and inspect the sources used by the report',
    tags: ['news', 'headlines', 'context'],
  },
  {
    code: DailyChallengeTopic.STATISTICS_AND_NUMBERS,
    name: 'Statistics and numbers',
    scenario: 'a precise percentage presented without a dataset or definition',
    primarySource:
      'the original dataset, methodology, definitions, and publication notes',
    weakSignal: 'a chart with no axis labels, source, sample, or time period',
    contextCheck:
      'the population, sample, baseline, method, date, and margin of uncertainty',
    verificationAction:
      'trace the number to its dataset and check how it was calculated',
    tags: ['statistics', 'data-literacy', 'evidence-evaluation'],
  },
  {
    code: DailyChallengeTopic.CELEBRITY_INFORMATION,
    name: 'Celebrity information',
    scenario: 'a sensational personal claim attributed to an unnamed insider',
    primarySource:
      'an attributable statement or responsible reporting with independently checked sources',
    weakSignal:
      'an engagement account repeating private allegations without evidence',
    contextCheck:
      'the original source, date, quotation, corroboration, privacy, and possible satire',
    verificationAction:
      'avoid amplifying personal claims that lack attributable, relevant evidence',
    tags: ['celebrity', 'rumours', 'responsible-sharing'],
  },
] as const;

export const DAILY_COMPETENCY_SEQUENCE = [
  DailyChallengeCompetency.CLAIM_IDENTIFICATION,
  DailyChallengeCompetency.SOURCE_CREDIBILITY,
  DailyChallengeCompetency.SOURCE_INDEPENDENCE,
  DailyChallengeCompetency.DATE_AND_RECENCY,
  DailyChallengeCompetency.CONTEXT_RECOGNITION,
  DailyChallengeCompetency.MANIPULATION_RECOGNITION,
  DailyChallengeCompetency.EVIDENCE_EVALUATION,
  DailyChallengeCompetency.AUDIO_VIDEO_CAUTION,
  DailyChallengeCompetency.RESPONSIBLE_SHARING,
  DailyChallengeCompetency.INSUFFICIENT_EVIDENCE,
] as const;

function dayNumber(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T00:00:00.000Z`) / 86_400_000);
}

export function dailyChallengeContent(dateKey: string) {
  const topic =
    DAILY_TOPICS[Math.abs(dayNumber(dateKey)) % DAILY_TOPICS.length]!;
  const question = (
    number: number,
    prompt: string,
    options: Array<{ id: string; text: string }>,
    correctOptionId: string,
    explanation: string,
  ) => ({
    id: `${dateKey}-q${String(number).padStart(2, '0')}`,
    type: QuizQuestionType.SINGLE_CHOICE,
    prompt: `${prompt}`,
    options,
    correctOptionIds: [correctOptionId],
    explanation,
    competency: DAILY_COMPETENCY_SEQUENCE[number - 1]!,
    secondaryCompetencies: [],
    topic: topic.code,
    educationalObjective: explanation,
  });

  return {
    topic,
    title: `Daily practice: ${topic.name}`,
    scenario: `Today’s ten decisions examine ${topic.scenario}. The case is fictional, but the verification habits apply to real content.`,
    content: `Focus on source quality, ${topic.contextCheck}, uncertainty, and what to do before sharing.`,
    questions: [
      question(
        1,
        `A message describes ${topic.scenario}. What is the central claim to verify?`,
        [
          {
            id: 'a',
            text: 'That the event, warning, or offer happened as the message describes',
          },
          { id: 'b', text: 'That the post received reactions and comments' },
          { id: 'c', text: 'That the message uses an eye-catching design' },
        ],
        'a',
        'Identify the factual statement that could be checked before judging the design or popularity around it.',
      ),
      question(
        2,
        'Which source is the strongest starting point for checking the claim?',
        [
          { id: 'a', text: topic.primarySource },
          { id: 'b', text: topic.weakSignal },
          {
            id: 'c',
            text: 'Two independent reports that identify their sources',
          },
        ],
        'a',
        'An attributable primary record can be inspected directly and compared with other independent evidence.',
      ),
      question(
        3,
        'Three pages repeat the same unnamed source. How many independent evidence lines is that?',
        [
          { id: 'a', text: 'Three, because there are three URLs' },
          {
            id: 'b',
            text: 'One, unless the pages independently verified the claim',
          },
          { id: 'c', text: 'None, because online sources are never useful' },
        ],
        'b',
        'Repeated publication can still trace back to one unverified origin.',
      ),
      question(
        4,
        'Why must you check the original publication date before sharing?',
        [
          {
            id: 'a',
            text: 'Old or expired information can be presented as if it applies today',
          },
          { id: 'b', text: 'Recent posts are always accurate' },
          { id: 'c', text: 'The publication date only affects the design' },
        ],
        'a',
        'Recency matters because circumstances, guidance, deadlines, and affected audiences can change.',
      ),
      question(
        5,
        'What context is most important before accepting the claim?',
        [
          { id: 'a', text: topic.contextCheck },
          { id: 'b', text: 'Whether the design uses dramatic colours' },
          { id: 'c', text: 'Whether a friend already forwarded it' },
        ],
        'a',
        'Place, time, scope, and limitations can materially change what a claim means.',
      ),
      question(
        6,
        'A screenshot removes the account name and timestamp. What should you record?',
        [
          {
            id: 'a',
            text: 'The missing source and time context as a limitation',
          },
          { id: 'b', text: 'That the screenshot is definitely fabricated' },
          { id: 'c', text: 'That cropping never changes meaning' },
        ],
        'a',
        'Missing provenance limits what the screenshot can establish.',
      ),
      question(
        7,
        'Which evidence is weakest when considered on its own?',
        [
          { id: 'a', text: topic.primarySource },
          { id: 'b', text: topic.weakSignal },
          {
            id: 'c',
            text: 'Independent reporting that identifies its sources',
          },
        ],
        'b',
        'Confidence, appearance, or popularity cannot replace attributable evidence.',
      ),
      question(
        8,
        'A cropped image, short clip, or voice note is offered as proof. What should you do?',
        [
          {
            id: 'a',
            text: 'Trace the original, check its date and context, and separate what is observable from the added claim',
          },
          {
            id: 'b',
            text: 'Assume the media proves every detail in its caption',
          },
          { id: 'c', text: 'Judge authenticity only by how polished it looks' },
        ],
        'a',
        'Media can be genuine yet presented with a false date, location, speaker, or description.',
      ),
      question(
        9,
        'What is the most responsible sharing decision?',
        [
          { id: 'a', text: 'Share immediately while attention is high' },
          {
            id: 'b',
            text: `Pause, ${topic.verificationAction}, and state any remaining uncertainty`,
          },
          { id: 'c', text: 'Remove the source so the message is shorter' },
        ],
        'b',
        'Verification and visible uncertainty reduce the risk of spreading a misleading claim.',
      ),
      question(
        10,
        'What does “not enough evidence yet” mean?',
        [
          { id: 'a', text: 'The claim is automatically false' },
          { id: 'b', text: 'The claim is automatically true' },
          {
            id: 'c',
            text: 'A firm conclusion is not supported by what is currently available',
          },
        ],
        'c',
        'Unresolved is an honest finding and is different from true or false.',
      ),
    ],
  };
}
