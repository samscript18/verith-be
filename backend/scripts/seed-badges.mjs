import { createRequire } from 'node:module';
import mongoose from 'mongoose';

const DATABASE_URI =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/verith';
const require = createRequire(import.meta.url);

function loadFixedBadgeCatalog() {
  try {
    const catalogModule = require('../dist/api/gamification/constants/badge-catalog.js');
    return catalogModule.FIXED_BADGE_CATALOG;
  } catch (error) {
    throw new Error(
      'The compiled badge catalog is unavailable. Run npm run build before npm run seed:badges.',
      { cause: error },
    );
  }
}

async function seedBadges() {
  const catalog = loadFixedBadgeCatalog();
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error('The compiled fixed badge catalog is empty or invalid.');
  }

  await mongoose.connect(DATABASE_URI, { serverSelectionTimeoutMS: 10_000 });
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error('MongoDB connection did not expose a database.');
  }

  const owner = await database
    .collection('users')
    .findOne(
      { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      { projection: { _id: 1, email: 1 } },
    );
  if (!owner) {
    throw new Error(
      'An ACTIVE SUPER_ADMIN must exist before the fixed badge catalog can be seeded.',
    );
  }

  const badges = database.collection('badges');
  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const definition of catalog) {
    const result = await badges.updateOne(
      { $or: [{ code: definition.code }, { slug: definition.slug }] },
      {
        $set: { ...definition, updatedAt: now },
        $setOnInsert: {
          active: true,
          createdAt: now,
          createdBy: new mongoose.Types.ObjectId(String(owner._id)),
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) created += 1;
    else if (result.modifiedCount > 0) updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        ownerId: String(owner._id),
        ownerEmail: owner.email,
        result: 'FIXED_BADGE_CATALOG_READY',
        total: catalog.length,
        created,
        updated,
        unchanged: catalog.length - created - updated,
        preservedCustomBadges: true,
      },
      null,
      2,
    ),
  );
}

try {
  await seedBadges();
} finally {
  await mongoose.disconnect();
}
