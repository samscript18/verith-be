import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';

interface DailyTopic {
  code: string;
  name: string;
  scenario: string;
  primarySource: string;
  weakSignal: string;
  contextCheck: string;
  verificationAction: string;
  tags: string[];
}

const DAILY_TOPICS: readonly DailyTopic[] = [
  {
    code: 'public-health',
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
    code: 'elections',
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
    code: 'climate-weather',
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
    code: 'education',
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
    code: 'money-scams',
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
    code: 'images-video',
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
    code: 'science-technology',
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
  });

  return {
    topic,
    title: `Daily practice: ${topic.name}`,
    scenario: `Today’s ten decisions examine ${topic.scenario}. The case is fictional, but the verification habits apply to real content.`,
    content: `Focus on source quality, ${topic.contextCheck}, uncertainty, and what to do before sharing.`,
    questions: [
      question(
        1,
        'Which record should you inspect first?',
        [
          { id: 'a', text: topic.primarySource },
          { id: 'b', text: topic.weakSignal },
          { id: 'c', text: 'The post with the most reactions' },
        ],
        'a',
        'The primary, dated record is attributable and can be inspected directly.',
      ),
      question(
        2,
        'Which item is the weakest evidence on its own?',
        [
          { id: 'a', text: topic.primarySource },
          { id: 'b', text: topic.weakSignal },
          {
            id: 'c',
            text: 'Two independent reports that identify their sources',
          },
        ],
        'b',
        'Confidence or popularity cannot replace an attributable source.',
      ),
      question(
        3,
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
        4,
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
        5,
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
        'Which statement keeps observation separate from interpretation?',
        [
          { id: 'a', text: 'The content proves the uploader’s motive' },
          {
            id: 'b',
            text: 'The visible or quoted material is observable; the added claim still needs evidence',
          },
          {
            id: 'c',
            text: 'A confident tone confirms the identity of the speaker',
          },
        ],
        'b',
        'Direct observations should not be expanded into unsupported conclusions.',
      ),
      question(
        8,
        'A statistic appears without its method. What is the strongest next step?',
        [
          {
            id: 'a',
            text: 'Find its original dataset, definition, population, and date',
          },
          { id: 'b', text: 'Trust it if the number is precise' },
          { id: 'c', text: 'Average it with numbers from comments' },
        ],
        'a',
        'A number is meaningful only with its definition, scope, source, and method.',
      ),
      question(
        9,
        'What should you do if the strongest page cannot be accessed lawfully?',
        [
          { id: 'a', text: 'Invent the missing passage from the headline' },
          {
            id: 'b',
            text: `Record the access limitation and ${topic.verificationAction}`,
          },
          { id: 'c', text: 'Treat access failure as proof the claim is false' },
        ],
        'b',
        'An access problem is a limitation, not evidence for or against the claim.',
      ),
      question(
        10,
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
    ],
  };
}
