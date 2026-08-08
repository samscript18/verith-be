import mongoose from 'mongoose';

const DATABASE_URI =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/verith';

const CATALOG_INDEXES = [
  {
    collection: 'courses',
    keys: { status: 1, difficulty: 1, _id: -1 },
    name: 'catalog_status_difficulty_cursor',
  },
  {
    collection: 'lessons',
    keys: { status: 1, courseId: 1, _id: -1 },
    name: 'catalog_status_course_cursor',
  },
  {
    collection: 'quizzes',
    keys: { status: 1, courseId: 1, _id: -1 },
    name: 'catalog_status_course_cursor',
  },
  {
    collection: 'challenges',
    keys: { status: 1, difficulty: 1, _id: -1 },
    name: 'catalog_status_difficulty_cursor',
  },
  {
    collection: 'badges',
    keys: { active: 1, category: 1, _id: -1 },
    name: 'catalog_active_category_cursor',
  },
  {
    collection: 'badges',
    keys: { active: 1, sortOrder: 1, _id: 1 },
    name: 'catalog_active_sort_order',
  },
  {
    collection: 'user_badges',
    keys: { userId: 1, badgeCode: 1 },
    name: 'user_badge_code_unique',
    options: { unique: true, sparse: true },
  },
  {
    collection: 'achievement_events',
    keys: { userId: 1, idempotencyReference: 1 },
    name: 'achievement_event_idempotency_unique',
    options: { unique: true },
  },
  {
    collection: 'achievement_events',
    keys: { userId: 1, celebrationSeenAt: 1, createdAt: 1 },
    name: 'achievement_event_unseen_queue',
  },
];

async function createCatalogIndexes() {
  await mongoose.connect(DATABASE_URI, { serverSelectionTimeoutMS: 10_000 });
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error('MongoDB connection did not expose a database.');
  }

  const results = [];
  for (const definition of CATALOG_INDEXES) {
    const collection = database.collection(definition.collection);
    const indexes = await collection.listIndexes().toArray().catch((error) => {
      if (error?.codeName === 'NamespaceNotFound') return [];
      throw error;
    });
    const matchingIndex = indexes.find(
      (index) => JSON.stringify(index.key) === JSON.stringify(definition.keys),
    );

    if (matchingIndex) {
      results.push({
        collection: definition.collection,
        index: matchingIndex.name,
        state: 'ALREADY_EXISTS',
      });
      continue;
    }

    const indexName = await collection.createIndex(definition.keys, {
      name: definition.name,
      background: true,
      ...(definition.options ?? {}),
    });
    results.push({
      collection: definition.collection,
      index: indexName,
      state: 'CREATED',
    });
  }

  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        result: 'CATALOG_INDEXES_READY',
        indexes: results,
      },
      null,
      2,
    ),
  );
}

try {
  await createCatalogIndexes();
} finally {
  await mongoose.disconnect();
}
