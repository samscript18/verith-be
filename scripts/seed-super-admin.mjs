import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

const ADMIN = {
  id: '6a6db407d1403c9c6b52ec09',
  email: 'adeolasam20@gmail.com',
  username: 'adeolasam20',
  displayName: 'Jayden',
  firstName: 'Samuel',
  lastName: 'Adesugba',
  bio: 'Ethusiastic specie. Curios about the authenticity of data.',
  avatar:
    'https://res.cloudinary.com/g4zwffkl/image/upload/v1785576133/verith/users/6a6db407d1403c9c6b52ec09/avatar/6a6dbac37e8207a3aac844cf-d2973731-a456-4b19-84c8-a25ba88bd203.jpg',
};

const DATABASE_URI =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/verith';

function validBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

async function resolvePasswordHash() {
  const suppliedHash = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH?.trim();
  if (suppliedHash) {
    if (!validBcryptHash(suppliedHash)) {
      throw new Error(
        'BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH is not a valid bcrypt hash.',
      );
    }
    return suppliedHash;
  }

  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'Set BOOTSTRAP_SUPER_ADMIN_PASSWORD to at least 12 characters when creating the super-admin for the first time.',
    );
  }
  return bcrypt.hash(password, 12);
}

async function seedSuperAdmin() {
  await mongoose.connect(DATABASE_URI, { serverSelectionTimeoutMS: 10_000 });
  const database = mongoose.connection.db;
  if (!database)
    throw new Error('MongoDB connection did not expose a database.');

  const users = database.collection('users');
  const objectId = new mongoose.Types.ObjectId(ADMIN.id);
  const existing = await users.findOne({
    $or: [
      { _id: objectId },
      { emailNormalized: ADMIN.email.toLowerCase() },
      { usernameNormalized: ADMIN.username.toLowerCase() },
    ],
  });

  if (existing) {
    const isExpectedIdentity =
      existing.emailNormalized === ADMIN.email.toLowerCase() &&
      existing.usernameNormalized === ADMIN.username.toLowerCase();
    if (!isExpectedIdentity) {
      throw new Error(
        'Super-admin bootstrap conflicts with an existing user ID, email, or username.',
      );
    }
    if (existing.role !== 'SUPER_ADMIN' || existing.status !== 'ACTIVE') {
      throw new Error(
        `${ADMIN.email} exists but is not an ACTIVE SUPER_ADMIN; refusing to elevate it automatically.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          database: mongoose.connection.name,
          id: String(existing._id),
          email: ADMIN.email,
          result: 'ALREADY_EXISTS',
        },
        null,
        2,
      ),
    );
    return;
  }

  const passwordHash = await resolvePasswordHash();
  const now = new Date();
  await users.insertOne({
    _id: objectId,
    email: ADMIN.email,
    emailNormalized: ADMIN.email.toLowerCase(),
    username: ADMIN.username,
    usernameNormalized: ADMIN.username.toLowerCase(),
    passwordHash,
    authProvider: 'LOCAL',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    displayName: ADMIN.displayName,
    firstName: ADMIN.firstName,
    lastName: ADMIN.lastName,
    bio: ADMIN.bio,
    avatar: ADMIN.avatar,
    preferredLanguage: 'en',
    timezone: 'UTC',
    theme: 'dark',
    notificationPreferences: {},
    privacyPreferences: { publicProfile: true, leaderboard: true },
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
    version: 0,
  });

  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        id: ADMIN.id,
        email: ADMIN.email,
        result: 'CREATED',
      },
      null,
      2,
    ),
  );
}

try {
  await seedSuperAdmin();
} finally {
  await mongoose.disconnect();
}
