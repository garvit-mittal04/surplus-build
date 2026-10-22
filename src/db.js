import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = 3;

// The full, current schema. A brand-new database is created from this directly.
const LISTINGS_TABLE = `
CREATE TABLE listings (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  batch_code TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL CHECK (grade IN ('A','B','C','D')),
  qty INTEGER NOT NULL CHECK (qty >= 0),
  qty_initial INTEGER NOT NULL CHECK (qty_initial > 0),
  unit TEXT NOT NULL,
  retail_unit_price REAL NOT NULL CHECK (retail_unit_price > 0),
  ask_unit_price REAL NOT NULL CHECK (ask_unit_price > 0),
  city TEXT NOT NULL,
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  age_months INTEGER NOT NULL DEFAULT 0,
  storage TEXT NOT NULL DEFAULT 'indoor',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'review'
    CHECK (status IN ('review','awaiting_fee','live','sold','rejected','withdrawn')),
  check_json TEXT NOT NULL DEFAULT '{}',
  verified INTEGER NOT NULL DEFAULT 0,
  fee_paid INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  sold_at TEXT,
  price_dropped_at TEXT
);`;

const SCHEMA = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','inspector','admin')),
  city TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT '',
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE otps (
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

${LISTINGS_TABLE}

CREATE TABLE photos (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('label','count','items','defect')),
  file TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL
);

CREATE TABLE enquiries (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined')),
  reserved_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, buyer_id)
);

CREATE TABLE inspections (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  inspector_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  matches_listing INTEGER,
  counted_qty INTEGER,
  grade_confirmed TEXT,
  notes TEXT NOT NULL DEFAULT '',
  fee REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);

CREATE TABLE outbox (
  id INTEGER PRIMARY KEY,
  to_phone TEXT NOT NULL,
  channel TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'logged',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Tables and indexes added in version 2. Safe to run on both new and upgraded databases.
const V2_ADDITIONS = `
CREATE TABLE IF NOT EXISTS inspection_photos (
  id INTEGER PRIMARY KEY,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  mime TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  enquiry_id INTEGER REFERENCES enquiries(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  total REAL NOT NULL CHECK (total > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY,
  enquiry_id INTEGER NOT NULL UNIQUE REFERENCES enquiries(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  as_described INTEGER NOT NULL CHECK (as_described IN (0,1)),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  q TEXT NOT NULL DEFAULT '',
  min_qty INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS otps_phone ON otps(phone);
CREATE INDEX IF NOT EXISTS listings_status_city ON listings(status, city);
CREATE INDEX IF NOT EXISTS photos_listing ON photos(listing_id);
CREATE INDEX IF NOT EXISTS photos_hash ON photos(sha256);
CREATE INDEX IF NOT EXISTS sales_listing ON sales(listing_id);
CREATE INDEX IF NOT EXISTS ratings_seller ON ratings(seller_id);
CREATE INDEX IF NOT EXISTS alerts_user ON alerts(user_id);
`;

const hasTable = (db, name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const hasColumn = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

/** Upgrade a version-1 database (the first MVP) to version 2 without losing data. */
function migrateV1toV2(db) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    // Listings: new status value, partial quantities, views, price drops. SQLite needs a table rebuild
    // to change a CHECK constraint.
    db.exec(LISTINGS_TABLE.replace('CREATE TABLE listings', 'CREATE TABLE listings_v2'));
    db.exec(`INSERT INTO listings_v2 (id, seller_id, title, category, brand, model, batch_code, grade, qty, qty_initial, unit,
        retail_unit_price, ask_unit_price, city, area, address, age_months, storage, description, status, check_json,
        verified, fee_paid, reject_reason, created_at, published_at, sold_at)
      SELECT id, seller_id, title, category, brand, model, batch_code, grade,
        CASE WHEN status = 'sold' THEN 0 ELSE qty END, qty, unit,
        retail_unit_price, ask_unit_price, city, area, address, age_months, storage, description, status, check_json,
        verified, fee_paid, reject_reason, created_at, published_at, sold_at
      FROM listings`);
    db.exec(V2_ADDITIONS.split('CREATE INDEX')[0]); // new tables first
    // v1 recorded a sale as a single total on the listing; carry it over as one sale of the whole lot.
    db.exec(`INSERT INTO sales (listing_id, qty, total, created_at)
      SELECT id, qty, sold_total, COALESCE(sold_at, datetime('now')) FROM listings WHERE status = 'sold' AND sold_total > 0`);
    db.exec('DROP TABLE listings');
    db.exec('ALTER TABLE listings_v2 RENAME TO listings');

    if (!hasColumn(db, 'users', 'intent')) db.exec("ALTER TABLE users ADD COLUMN intent TEXT NOT NULL DEFAULT ''");
    // Existing people have already used the app; do not send them through onboarding again.
    if (!hasColumn(db, 'users', 'onboarded')) db.exec('ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 1');
    if (!hasColumn(db, 'inspections', 'fee')) db.exec('ALTER TABLE inspections ADD COLUMN fee REAL NOT NULL DEFAULT 0');
    if (!hasColumn(db, 'inspections', 'paid')) db.exec('ALTER TABLE inspections ADD COLUMN paid INTEGER NOT NULL DEFAULT 0');
    if (!hasColumn(db, 'outbox', 'status')) db.exec("ALTER TABLE outbox ADD COLUMN status TEXT NOT NULL DEFAULT 'logged'");
    if (!hasColumn(db, 'outbox', 'error')) db.exec("ALTER TABLE outbox ADD COLUMN error TEXT NOT NULL DEFAULT ''");

    db.exec(V2_ADDITIONS);
    db.exec('PRAGMA user_version = 2');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  const problems = db.prepare('PRAGMA foreign_key_check').all();
  if (problems.length) throw new Error('Migration left broken references: ' + JSON.stringify(problems.slice(0, 3)));
}

/** Version 3: accepted enquiries hold stock until reserved_until. */
function migrateV2toV3(db) {
  if (!hasColumn(db, 'enquiries', 'reserved_until')) db.exec('ALTER TABLE enquiries ADD COLUMN reserved_until TEXT');
  db.exec('PRAGMA user_version = 3');
}

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');

  if (!hasTable(db, 'users')) {
    db.exec('BEGIN');
    db.exec(SCHEMA);
    db.exec(V2_ADDITIONS);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } else {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version < 2) migrateV1toV2(db);
    if (version < 3) migrateV2toV3(db);
  }
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/** Run fn inside a transaction; roll back on throw. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
