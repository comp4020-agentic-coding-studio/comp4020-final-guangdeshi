// Explicit, ordered, idempotent migrations. Each migration runs at most once
// per database file (tracked in the `migrations` table) and is applied
// inside its own transaction, so a crash mid-migration never leaves the
// schema half-applied. New schema changes are added as a new entry at the
// bottom, never by editing an already-shipped migration, so a database that
// already applied an earlier version doesn't inherit a different schema.
import type { DatabaseSync } from "node:sqlite";

interface Migration {
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    name: "0001_init",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        handle TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        avatar_image_id TEXT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_secret TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE user_interests (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, category_id)
      );

      CREATE TABLE images (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        price_cents INTEGER NULL,
        currency TEXT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id),
        tags TEXT NOT NULL DEFAULT '[]',
        visibility TEXT NOT NULL CHECK (visibility IN ('public','unlisted')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_posts_feed ON posts(status, visibility, created_at DESC);
      CREATE INDEX idx_posts_category ON posts(category_id, status, visibility, created_at DESC);
      CREATE INDEX idx_posts_author ON posts(author_id, created_at DESC);

      CREATE TABLE post_images (
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        PRIMARY KEY (post_id, image_id)
      );
      CREATE INDEX idx_post_images_post ON post_images(post_id, position);

      CREATE TABLE opinions (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stance TEXT NOT NULL CHECK (stance IN ('BUY','PASS')),
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (post_id, user_id)
      );
      CREATE INDEX idx_opinions_post ON opinions(post_id);
      CREATE INDEX idx_opinions_user ON opinions(user_id, created_at DESC);

      CREATE TABLE post_outcomes (
        post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('BOUGHT','DID_NOT_BUY','STILL_DECIDING')),
        reflection TEXT NOT NULL DEFAULT '',
        decided_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK (target_type IN ('post','opinion')),
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
        created_at TEXT NOT NULL,
        resolved_at TEXT NULL
      );
      CREATE INDEX idx_reports_status ON reports(status, created_at DESC);

      CREATE TABLE activity_events (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        request_id TEXT NOT NULL,
        user_id TEXT NULL,
        action TEXT NOT NULL,
        target_type TEXT NULL,
        target_id TEXT NULL,
        status TEXT NOT NULL CHECK (status IN ('success','failure')),
        latency_ms INTEGER NULL,
        meta TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX idx_activity_events_ts ON activity_events(ts DESC);
      CREATE INDEX idx_activity_events_user ON activity_events(user_id, ts DESC);
    `,
  },
  {
    name: "0002_seed_categories",
    sql: `
      INSERT INTO categories (id, name, description, sort_order) VALUES
        ('computing', 'Computing & Tech', 'Laptops, desktops, peripherals, dev hardware', 10),
        ('audio', 'Audio', 'Headphones, speakers, music gear', 20),
        ('photography', 'Photography', 'Cameras, lenses, accessories', 30),
        ('gaming', 'Gaming', 'Consoles, PC gaming gear, accessories', 40),
        ('home-kitchen', 'Home & Kitchen', 'Appliances, kitchenware, furniture', 50),
        ('fashion', 'Fashion & Accessories', 'Clothing, shoes, bags, watches', 60),
        ('outdoors-fitness', 'Outdoors & Fitness', 'Sports, camping, exercise gear', 70),
        ('vehicles', 'Vehicles & Gear', 'Cars, bikes, parts, accessories', 80),
        ('books-hobbies', 'Books & Hobbies', 'Books, crafts, collectibles, instruments', 90),
        ('other', 'Other', 'Anything that does not fit elsewhere', 100);
    `,
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (db.prepare("SELECT name FROM migrations").all() as { name: string }[]).map((r) => r.name),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)").run(
        migration.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${migration.name} failed: ${(err as Error).message}`);
    }
  }
}
