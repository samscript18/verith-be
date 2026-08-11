import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDirectory, '..');
const distRoot = resolve(backendRoot, 'dist');
const require = createRequire(import.meta.url);
const dryRun = process.argv.includes('--dry-run');
const summaryOnly = process.argv.includes('--summary');
const DATABASE_URI =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/verith';

const COMPATIBILITY_OPTIONS = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
];

async function schemaFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return schemaFiles(path);
      return entry.isFile() && entry.name.endsWith('.schema.js') ? [path] : [];
    }),
  );
  return files.flat().sort();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function keySignature(keys) {
  // Field order is part of a compound MongoDB index definition.
  return JSON.stringify(keys);
}

function normalizedCompatibilityOptions(options = {}) {
  const normalized = {};
  for (const key of COMPATIBILITY_OPTIONS) {
    if (key === 'unique' || key === 'sparse') {
      normalized[key] = options[key] === true;
      continue;
    }
    if (options[key] !== undefined) {
      normalized[key] =
        key === 'expireAfterSeconds'
          ? Number(options[key])
          : stableValue(options[key]);
    }
  }
  return normalized;
}

function sameCompatibilityOptions(expected, actual) {
  return (
    JSON.stringify(normalizedCompatibilityOptions(expected)) ===
    JSON.stringify(normalizedCompatibilityOptions(actual))
  );
}

async function discoverIndexDefinitions() {
  const files = [
    ...(await schemaFiles(resolve(distRoot, 'api'))),
    ...(await schemaFiles(resolve(distRoot, 'core'))),
  ];
  const definitions = new Map();

  for (const file of files) {
    const relativePath = relative(distRoot, file);
    // Gamification owns its own catalog/backfill bootstrap. Keeping it out of
    // this general manifest prevents two rollout paths from drifting.
    if (relativePath.split(sep).includes('gamification')) continue;

    const module = require(file);
    for (const [exportName, candidate] of Object.entries(module)) {
      if (!(candidate instanceof mongoose.Schema)) continue;
      const indexes = candidate.indexes();
      if (!indexes.length) continue;
      const modelName = exportName.endsWith('Schema')
        ? exportName.slice(0, -'Schema'.length)
        : undefined;
      const explicitCollection = candidate.options.collection;
      const defaultPluralizer = mongoose.pluralize();
      const derivedCollection =
        modelName &&
        typeof module[modelName] === 'function' &&
        typeof defaultPluralizer === 'function'
          ? defaultPluralizer(modelName)
          : undefined;
      const collection = explicitCollection ?? derivedCollection;
      if (typeof collection !== 'string' || !collection.trim()) {
        throw new Error(
          `Cannot resolve the MongoDB collection for ${relativePath}#${exportName}. Set an explicit schema collection before production deployment.`,
        );
      }

      for (const [keys, options] of indexes) {
        const signature = `${collection}:${keySignature(keys)}`;
        const existing = definitions.get(signature);
        if (existing && !sameCompatibilityOptions(existing.options, options)) {
          throw new Error(
            `Compiled schemas define incompatible options for ${signature}.`,
          );
        }
        definitions.set(signature, {
          collection,
          keys,
          options,
          source: `${relativePath}#${exportName}`,
        });
      }
    }
  }

  return [...definitions.values()].sort(
    (left, right) =>
      left.collection.localeCompare(right.collection) ||
      keySignature(left.keys).localeCompare(keySignature(right.keys)),
  );
}

async function existingIndexes(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26)
      return [];
    throw error;
  }
}

async function buildPlan(database, definitions) {
  const byCollection = Map.groupBy(
    definitions,
    (definition) => definition.collection,
  );
  const plan = [];
  const conflicts = [];

  for (const [collectionName, collectionDefinitions] of byCollection) {
    const collection = database.collection(collectionName);
    const indexes = await existingIndexes(collection);
    for (const definition of collectionDefinitions) {
      const existing = indexes.find(
        (index) => keySignature(index.key) === keySignature(definition.keys),
      );
      if (!existing) {
        plan.push({ ...definition, state: 'MISSING' });
        continue;
      }
      if (!sameCompatibilityOptions(definition.options, existing)) {
        conflicts.push({
          collection: collectionName,
          keys: definition.keys,
          expected: normalizedCompatibilityOptions(definition.options),
          actual: normalizedCompatibilityOptions(existing),
          existingIndex: existing.name,
          source: definition.source,
        });
        continue;
      }
      plan.push({
        ...definition,
        existingIndex: existing.name,
        state: 'ALREADY_EXISTS',
      });
    }
  }

  if (conflicts.length) {
    throw new Error(
      `Production index compatibility check failed. Resolve these indexes before startup: ${JSON.stringify(conflicts)}`,
    );
  }
  return plan;
}

async function createApplicationIndexes() {
  const definitions = await discoverIndexDefinitions();
  if (!definitions.length) {
    throw new Error(
      'No compiled application indexes were discovered. Run npm run build before provisioning indexes.',
    );
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          result: 'APPLICATION_INDEX_MANIFEST_READY',
          collections: new Set(
            definitions.map((definition) => definition.collection),
          ).size,
          indexes: definitions.length,
          ...(!summaryOnly
            ? {
                definitions: definitions.map(
                  ({ collection, keys, options, source }) => ({
                    collection,
                    keys,
                    options: normalizedCompatibilityOptions(options),
                    source,
                  }),
                ),
              }
            : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  await mongoose.connect(DATABASE_URI, { serverSelectionTimeoutMS: 10_000 });
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error('MongoDB connection did not expose a database.');
  }

  // Validate the complete manifest before making an additive change, so an
  // incompatible unique or TTL index fails startup without a partial rollout.
  const plan = await buildPlan(database, definitions);
  const results = [];
  for (const definition of plan) {
    if (definition.state === 'ALREADY_EXISTS') {
      results.push({
        collection: definition.collection,
        index: definition.existingIndex,
        state: definition.state,
      });
      continue;
    }
    let index;
    try {
      index = await database
        .collection(definition.collection)
        .createIndex(definition.keys, definition.options);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create MongoDB index for ${definition.collection} ${JSON.stringify(definition.keys)} from ${definition.source}: ${detail}`,
        { cause: error },
      );
    }
    results.push({
      collection: definition.collection,
      index,
      state: 'CREATED',
    });
  }

  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        result: 'APPLICATION_INDEXES_READY',
        created: results.filter((item) => item.state === 'CREATED').length,
        existing: results.filter((item) => item.state === 'ALREADY_EXISTS')
          .length,
        indexes: results,
      },
      null,
      2,
    ),
  );
}

try {
  await createApplicationIndexes();
} finally {
  await mongoose.disconnect();
}
