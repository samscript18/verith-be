import mongoose from 'mongoose';

const ADMIN_EMAIL = 'adeolasam20@gmail.com';
const DATABASE_URI =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/verith';

const publishedAt = new Date();
const expiresAt = new Date(publishedAt);
expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);

const courseSeeds = [
  {
    title: 'Evidence Before Sharing',
    slug: 'evidence-before-sharing',
    description:
      'Build a repeatable habit for separating checkable claims from opinions, locating reliable evidence, and communicating uncertainty before forwarding a story.',
    difficulty: 'BEGINNER',
    estimatedDuration: 35,
    learningObjectives: [
      'Separate factual claims from opinion and emotional language.',
      'Choose evidence that directly addresses a claim.',
      'Explain what remains uncertain before sharing.',
    ],
    tags: ['claims', 'evidence', 'media-literacy'],
    lesson: {
      title: 'Find the Claim First',
      slug: 'find-the-claim-first',
      summary:
        'Turn a persuasive post into a precise claim that can actually be checked.',
      estimatedDuration: 15,
      sequence: 1,
      tags: ['claims', 'critical-thinking'],
      sanitizedHtml: `
        <h2>Start with the sentence that can be checked</h2>
        <p>A post may mix facts, opinions, predictions, and emotional language. Your first task is to identify the statement that evidence could support or contradict.</p>
        <h3>Use the person, action, place, and time test</h3>
        <p>Rewrite the message so it names who did what, where it happened, and when it happened. If one of those details is missing, record the gap instead of guessing.</p>
        <h3>Keep opinion separate</h3>
        <p>Words such as “terrible” or “amazing” describe a reaction. The underlying event may be verifiable, but the reaction is not the same as evidence.</p>
        <p><strong>Practice:</strong> Before sharing, write one sentence beginning with “The checkable claim is…”</p>
      `.trim(),
      quiz: {
        title: 'Claim or opinion?',
        description:
          'Check whether you can isolate a factual claim before looking for evidence.',
        passingScore: 70,
        maxAttempts: 3,
        rewardPolicy: { xp: 25, truthPoints: 10 },
        questions: [
          {
            id: 'claim-1',
            type: 'SINGLE_CHOICE',
            prompt: 'Which statement is a checkable factual claim?',
            options: [
              { id: 'a', text: 'The announcement is completely unfair.' },
              {
                id: 'b',
                text: 'The ministry published the announcement on 20 July.',
              },
              { id: 'c', text: 'Everyone will hate this decision.' },
            ],
            correctOptionIds: ['b'],
            explanation:
              'A publication date can be compared with an official record. The other statements express judgement or prediction.',
          },
          {
            id: 'claim-2',
            type: 'MULTIPLE_CHOICE',
            prompt: 'Which details make a claim easier to investigate?',
            options: [
              { id: 'a', text: 'Who performed the action' },
              { id: 'b', text: 'When the event occurred' },
              { id: 'c', text: 'How shocking the writer says it is' },
            ],
            correctOptionIds: ['a', 'b'],
            explanation:
              'Named actors and dates narrow the search. Emotional intensity does not make a claim more verifiable.',
          },
        ],
      },
    },
  },
  {
    title: 'Images Need Context',
    slug: 'images-need-context',
    description:
      'Learn how authentic images can mislead when captions, dates, crops, or locations detach them from their original context.',
    difficulty: 'BEGINNER',
    estimatedDuration: 40,
    learningObjectives: [
      'Inspect captions separately from the image itself.',
      'Recognise clues that an image has been reused out of context.',
      'Use source and date evidence before drawing a conclusion.',
    ],
    tags: ['images', 'context', 'source-checking'],
    lesson: {
      title: 'Read Beyond the Crop',
      slug: 'read-beyond-the-crop',
      summary:
        'Investigate what a screenshot or cropped image leaves outside the frame.',
      estimatedDuration: 18,
      sequence: 1,
      tags: ['images', 'screenshots', 'context'],
      sanitizedHtml: `
        <h2>An authentic image can still support a false story</h2>
        <p>The pixels may be real while the caption gives the wrong place, date, person, or event. Verify the image and the surrounding claim as separate pieces of evidence.</p>
        <h3>Look beyond the visible frame</h3>
        <p>Crops can remove usernames, dates, logos, qualifications, and replies. Ask what information would be visible in the original post or full photograph.</p>
        <h3>Trace the earliest reliable appearance</h3>
        <p>Compare earlier copies, trustworthy reporting, landmarks, weather, and publication dates. A matching image alone does not prove that the new caption is accurate.</p>
        <p><strong>Practice:</strong> State what the image shows, then separately state what the caption claims.</p>
      `.trim(),
      quiz: {
        title: 'Image context check',
        description:
          'Practice distinguishing visible image evidence from claims added by a caption.',
        passingScore: 70,
        maxAttempts: 3,
        rewardPolicy: { xp: 30, truthPoints: 12 },
        questions: [
          {
            id: 'image-1',
            type: 'SINGLE_CHOICE',
            prompt:
              'A real flood photograph is shared with a new city name. What should you verify first?',
            options: [
              {
                id: 'a',
                text: 'Whether the caption matches the image’s original place and date',
              },
              { id: 'b', text: 'Whether the post has many reactions' },
              { id: 'c', text: 'Whether the image looks dramatic' },
            ],
            correctOptionIds: ['a'],
            explanation:
              'The image may be authentic but reused. Its earliest reliable source and context are the key evidence.',
          },
          {
            id: 'image-2',
            type: 'MULTIPLE_CHOICE',
            prompt: 'Which clues can reveal missing screenshot context?',
            options: [
              { id: 'a', text: 'A cropped account name' },
              { id: 'b', text: 'A missing publication date' },
              { id: 'c', text: 'A large number of emoji reactions' },
            ],
            correctOptionIds: ['a', 'b'],
            explanation:
              'The account identity and date help establish provenance. Reactions do not establish the original context.',
          },
        ],
      },
    },
  },
];

const challengeSeeds = [
  {
    title: 'Pause Before Sharing',
    slug: 'pause-before-sharing',
    scenario:
      'A forwarded message says every school in your state will close tomorrow, but it names no official source.',
    content:
      'Choose the action that protects people from an unverified announcement while still allowing you to investigate it.',
    tags: ['responsible-sharing', 'source-checking', 'evidence'],
    difficulty: 'BEGINNER',
    rewardPolicy: { xp: 20, truthPoints: 8 },
    maxAttempts: 3,
    passingScore: 70,
    questions: [
      {
        id: 'pause-1',
        type: 'SINGLE_CHOICE',
        prompt: 'What is the strongest next step?',
        options: [
          { id: 'a', text: 'Forward it quickly so everyone is prepared' },
          {
            id: 'b',
            text: 'Check the education authority’s official channels and recent notices',
          },
          {
            id: 'c',
            text: 'Assume it is false because it was shared on social media',
          },
        ],
        correctOptionIds: ['b'],
        explanation:
          'An official current notice directly addresses the claim. Neither forwarding nor dismissing it without checking establishes the truth.',
      },
      {
        id: 'pause-2',
        type: 'SINGLE_CHOICE',
        prompt:
          'If no reliable confirmation is available, how should the message be described?',
        options: [
          { id: 'a', text: 'Confirmed' },
          { id: 'b', text: 'False' },
          { id: 'c', text: 'Unverified' },
        ],
        correctOptionIds: ['c'],
        explanation:
          'A lack of evidence does not automatically prove falsehood. “Unverified” communicates the limitation accurately.',
      },
    ],
  },
  {
    title: 'Real Image, Wrong Caption',
    slug: 'real-image-wrong-caption',
    scenario:
      'A dramatic photograph is described as a breaking event in Lagos, but an older article appears to contain the same image.',
    content:
      'Evaluate the image and caption as separate claims, then choose the evidence that best resolves the conflict.',
    tags: ['screenshots', 'visual-verification', 'context'],
    difficulty: 'INTERMEDIATE',
    rewardPolicy: { xp: 35, truthPoints: 15 },
    maxAttempts: 3,
    passingScore: 70,
    questions: [
      {
        id: 'caption-1',
        type: 'MULTIPLE_CHOICE',
        prompt:
          'Which findings would directly weaken the breaking-news caption?',
        options: [
          {
            id: 'a',
            text: 'The same image appeared years earlier in another country',
          },
          {
            id: 'b',
            text: 'The original photographer identifies a different event',
          },
          { id: 'c', text: 'The new post uses capital letters' },
        ],
        correctOptionIds: ['a', 'b'],
        explanation:
          'Earlier provenance and the photographer’s identification directly contradict the new place and time. Typography alone does not.',
      },
      {
        id: 'caption-2',
        type: 'SINGLE_CHOICE',
        prompt:
          'What is the most accurate conclusion if the photograph is genuine but the caption is wrong?',
        options: [
          { id: 'a', text: 'The entire image is AI-generated' },
          {
            id: 'b',
            text: 'The image is authentic but presented out of context',
          },
          { id: 'c', text: 'Every detail in the post is reliable' },
        ],
        correctOptionIds: ['b'],
        explanation:
          'Authenticity and context are separate questions. A real image can be paired with a misleading claim.',
      },
    ],
  },
];

const missionAssessmentQuestions = {
  BASELINE: [
    {
      id: 'baseline-sharing',
      type: 'RESPONSIBLE_SHARING',
      prompt: 'A forwarded voice note predicts an urgent bank shutdown but names no source. What should you do first?',
      options: [
        { id: 'forward', text: 'Forward it so others can prepare' },
        { id: 'verify', text: 'Pause and check current official notices and independent reporting' },
        { id: 'believe', text: 'Believe it because the speaker sounds confident' },
      ],
      correctOptionIds: ['verify'],
      explanation: 'Confidence and urgency do not replace source evidence. Check current official and independent records before sharing.',
      competency: 'RESPONSIBLE_SHARING',
    },
    {
      id: 'baseline-context',
      type: 'MULTIPLE_CHOICE',
      prompt: 'Which details are essential when checking a screenshot of an announcement?',
      options: [
        { id: 'date', text: 'The original publication date' },
        { id: 'source', text: 'The original account or publisher' },
        { id: 'forwards', text: 'How many times it was forwarded' },
      ],
      correctOptionIds: ['date', 'source'],
      explanation: 'Date and provenance establish context. Forward counts measure attention, not accuracy.',
      competency: 'CONTEXT_RECOGNITION',
    },
  ],
  FOLLOW_UP: [
    {
      id: 'followup-sharing',
      type: 'RESPONSIBLE_SHARING',
      prompt: 'A message says “share now before this is deleted” and cites an unnamed official. What is the strongest response?',
      options: [
        { id: 'share', text: 'Share immediately because deletion is possible' },
        { id: 'pause', text: 'Identify the exact claim and verify the authority before forwarding' },
        { id: 'ignore', text: 'Assume every urgent message is false' },
      ],
      correctOptionIds: ['pause'],
      explanation: 'The evidence-first response neither spreads nor dismisses the claim without checking it.',
      competency: 'RESPONSIBLE_SHARING',
    },
    {
      id: 'followup-context',
      type: 'SOURCE_COMPARISON',
      prompt: 'Two websites repeat one cropped notice. What would provide genuinely stronger evidence?',
      options: [
        { id: 'repetition', text: 'More websites copying the same notice' },
        { id: 'original', text: 'The complete original notice with date, publisher, and an independent confirmation' },
        { id: 'comments', text: 'Comments saying the notice looks real' },
      ],
      correctOptionIds: ['original'],
      explanation: 'Original context and independent confirmation are stronger than repeated copies or reactions.',
      competency: 'SOURCE_INDEPENDENCE',
    },
  ],
};

function sameId(left, right) {
  return String(left ?? '') === String(right ?? '');
}

async function assertSeedOwnership(collection, query, adminId, label) {
  const existing = await collection.findOne(query, {
    projection: { _id: 1, createdBy: 1 },
  });
  if (existing?.createdBy && !sameId(existing.createdBy, adminId)) {
    throw new Error(
      `Refusing to overwrite ${label}: the matching record belongs to another creator.`,
    );
  }
}

async function upsertOwned(
  collection,
  query,
  values,
  adminId,
  insertValues = {},
) {
  const now = new Date();
  await collection.updateOne(
    query,
    {
      $set: { ...values, updatedAt: now },
      $setOnInsert: {
        ...insertValues,
        createdAt: now,
        createdBy: adminId,
      },
    },
    { upsert: true },
  );
  return collection.findOne(query, { projection: { _id: 1 } });
}

async function migrateCommunityMission(missions, adminId) {
  const legacySlug = 'safe-sharing-on-whatsapp';
  const currentSlug = 'safe-sharing-on-social-media';
  const legacy = await missions.findOne(
    { slug: legacySlug },
    { projection: { _id: 1, createdBy: 1 } },
  );
  if (!legacy) return;
  if (legacy.createdBy && !sameId(legacy.createdBy, adminId)) {
    throw new Error(
      `Refusing to migrate mission ${legacySlug}: the record belongs to another creator.`,
    );
  }

  const current = await missions.findOne(
    { slug: currentSlug },
    { projection: { _id: 1, createdBy: 1 } },
  );
  if (current) {
    if (current.createdBy && !sameId(current.createdBy, adminId)) {
      throw new Error(
        `Refusing to migrate mission ${currentSlug}: the record belongs to another creator.`,
      );
    }
    await missions.updateOne(
      { _id: legacy._id },
      {
        $set: {
          slug: `archived-community-sharing-${String(legacy._id)}`,
          title: 'Archived Community Sharing Practice',
          status: 'ARCHIVED',
          updatedAt: new Date(),
        },
      },
    );
    return;
  }

  await missions.updateOne(
    { _id: legacy._id },
    {
      $set: {
        slug: currentSlug,
        title: 'Safe Sharing on Social Media',
        updatedAt: new Date(),
      },
    },
  );
}

async function seed() {
  await mongoose.connect(DATABASE_URI, { serverSelectionTimeoutMS: 10_000 });
  const database = mongoose.connection.db;
  if (!database)
    throw new Error('MongoDB connection did not expose a database.');

  const users = database.collection('users');
  const courses = database.collection('courses');
  const lessons = database.collection('lessons');
  const quizzes = database.collection('quizzes');
  const challenges = database.collection('challenges');
  const missions = database.collection('missions');
  const missionAssessments = database.collection('mission_assessments');
  const seeded = { courses: [], lessons: [], quizzes: [], challenges: [], missions: [] };

  const admin = await users.findOne({ emailNormalized: ADMIN_EMAIL });
  if (!admin)
    throw new Error(`Super-admin account ${ADMIN_EMAIL} was not found.`);
  if (admin.role !== 'SUPER_ADMIN' || admin.status !== 'ACTIVE') {
    throw new Error(
      `${ADMIN_EMAIL} must be an ACTIVE SUPER_ADMIN before content can be seeded.`,
    );
  }

  for (const courseSeed of courseSeeds) {
    await assertSeedOwnership(
      courses,
      { slug: courseSeed.slug },
      admin._id,
      `course ${courseSeed.slug}`,
    );
  }
  for (const challengeSeed of challengeSeeds) {
    await assertSeedOwnership(
      challenges,
      { slug: challengeSeed.slug },
      admin._id,
      `challenge ${challengeSeed.slug}`,
    );
  }

  for (const courseSeed of courseSeeds) {
    const { lesson, ...courseValues } = courseSeed;
    const course = await upsertOwned(
      courses,
      { slug: courseSeed.slug },
      {
        ...courseValues,
        status: 'PUBLISHED',
        updatedBy: admin._id,
      },
      admin._id,
      {
        lessonIds: [],
        prerequisiteCourseIds: [],
        publishedAt,
      },
    );

    const lessonQuery = { courseId: course._id, slug: lesson.slug };
    await assertSeedOwnership(
      lessons,
      lessonQuery,
      admin._id,
      `lesson ${lesson.slug}`,
    );
    const { quiz, ...lessonValues } = lesson;
    const lessonRecord = await upsertOwned(
      lessons,
      lessonQuery,
      {
        ...lessonValues,
        courseId: course._id,
        status: 'PUBLISHED',
        updatedBy: admin._id,
      },
      admin._id,
      { publishedAt },
    );

    await courses.updateOne(
      { _id: course._id },
      {
        $addToSet: { lessonIds: lessonRecord._id },
        $set: { updatedAt: new Date() },
      },
    );

    const quizQuery = { lessonId: lessonRecord._id };
    await assertSeedOwnership(
      quizzes,
      quizQuery,
      admin._id,
      `quiz for lesson ${lesson.slug}`,
    );
    const quizRecord = await upsertOwned(
      quizzes,
      quizQuery,
      {
        courseId: course._id,
        lessonId: lessonRecord._id,
        title: quiz.title,
        description: quiz.description,
        passingScore: quiz.passingScore,
        attemptPolicy: { maxAttempts: quiz.maxAttempts },
        rewardPolicy: quiz.rewardPolicy,
        questions: quiz.questions,
        status: 'PUBLISHED',
        updatedBy: admin._id,
      },
      admin._id,
      { publishedAt },
    );

    seeded.courses.push({ id: String(course._id), slug: courseSeed.slug });
    seeded.lessons.push({ id: String(lessonRecord._id), slug: lesson.slug });
    seeded.quizzes.push({ id: String(quizRecord._id), title: quiz.title });
  }

  for (const challengeSeed of challengeSeeds) {
    const challenge = await upsertOwned(
      challenges,
      { slug: challengeSeed.slug },
      {
        ...challengeSeed,
        status: 'PUBLISHED',
      },
      admin._id,
      { publishAt: publishedAt, expiresAt },
    );
    seeded.challenges.push({
      id: String(challenge._id),
      slug: challengeSeed.slug,
    });
  }

  await migrateCommunityMission(missions, admin._id);
  await assertSeedOwnership(
    missions,
    { slug: 'safe-sharing-on-social-media' },
    admin._id,
    'mission safe-sharing-on-social-media',
  );
  const learningCourse = await courses.findOne({
    slug: 'evidence-before-sharing',
  });
  const missionChallenge = await challenges.findOne({
    slug: 'pause-before-sharing',
  });
  const mission = await upsertOwned(
    missions,
    { slug: 'safe-sharing-on-social-media' },
    {
      title: 'Safe Sharing on Social Media',
      summary:
        'Practise calm, evidence-first responses to urgent posts, direct messages, voice notes, screenshots, and unsupported authority claims across social platforms.',
      topic: 'Responsible community sharing',
      audience: 'Young people, families, schools, and community groups',
      difficulty: 'BEGINNER',
      startsAt: publishedAt,
      endsAt: expiresAt,
      status: 'PUBLISHED',
      scenarios: [
        {
          id: 'old-notice',
          title: 'The old school notice',
          description:
            'A synthetic school-closure notice is recirculated without its original date. Identify the claim, recover its date, and decide what you would tell the sender.',
          synthetic: true,
          competencies: ['DATE_AND_RECENCY', 'RESPONSIBLE_SHARING'],
        },
        {
          id: 'secret-voice-note',
          title: 'The “secret information” voice note',
          description:
            'A synthetic voice note claims an unnamed insider knows a bank will close. Separate the spoken claim from assumptions about the speaker and list evidence you would need.',
          synthetic: true,
          competencies: ['AUDIO_VIDEO_CAUTION', 'SOURCE_IDENTIFICATION'],
        },
      ],
      lessonIds: learningCourse?.lessonIds ?? [],
      challengeIds: missionChallenge ? [missionChallenge._id] : [],
      rewardPolicy: { xp: 60, truthPoints: 25 },
      completionCriteria: {
        baselineRequired: true,
        requiredScenarios: 2,
        followUpRequired: true,
        linkedLearningRequired: true,
      },
      organization: 'Verith UNESCO Hackathon Pilot',
      privacyPolicy:
        'Only the participant sees individual responses. Facilitator reporting must use aggregate results and minimum-group privacy thresholds.',
      consentRequired: true,
    },
    admin._id,
  );
  for (const phase of ['BASELINE', 'FOLLOW_UP']) {
    await missionAssessments.updateOne(
      { missionId: mission._id, phase, version: 1 },
      {
        $set: {
          questions: missionAssessmentQuestions[phase],
          passingScore: 50,
          maxAttempts: 1,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          missionId: mission._id,
          phase,
          version: 1,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
  seeded.missions.push({
    id: String(mission._id),
    slug: 'safe-sharing-on-social-media',
  });

  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        attributedTo: ADMIN_EMAIL,
        status: 'PUBLISHED',
        seeded,
      },
      null,
      2,
    ),
  );
}

try {
  await seed();
} finally {
  await mongoose.disconnect();
}
