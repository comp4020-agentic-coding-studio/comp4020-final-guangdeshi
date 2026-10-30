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
  {
    // v2.0 "Which One?" mode: a post gains an explicit mode, defaulting every
    // existing row to BUY_PASS (brief's "old posts are treated as BUY_PASS
    // unless explicitly migrated" — satisfied by this default, not a backfill
    // script, so zero existing rows are touched). purchase_options holds the
    // 2-4 candidate products a WHICH_ONE post compares; it's empty for every
    // existing BUY_PASS post.
    name: "0003_post_modes_and_options",
    sql: `
      ALTER TABLE posts ADD COLUMN post_mode TEXT NOT NULL DEFAULT 'BUY_PASS' CHECK (post_mode IN ('BUY_PASS','WHICH_ONE'));

      CREATE TABLE purchase_options (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 3),
        name TEXT NOT NULL,
        image_id TEXT NULL REFERENCES images(id),
        expected_price_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        original_price_cents INTEGER NULL,
        condition TEXT NULL,
        source_url TEXT NULL,
        sale_note TEXT NULL,
        specifications TEXT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (post_id, position)
      );
      CREATE INDEX idx_purchase_options_post ON purchase_options(post_id, position);
    `,
  },
  {
    // Opinions on a WHICH_ONE post select a purchase_option (or explicitly
    // "none of these") instead of a BUY/PASS stance. node:sqlite's ALTER
    // TABLE can't relax an existing CHECK constraint, so this is a full
    // table rebuild (verified safe inside a transaction with foreign_keys=ON
    // during planning): copy every existing row forward with stance intact
    // and the two new columns at their "unused" default, so no existing
    // Buy/Pass opinion changes meaning. The CHECK enforces that an opinion
    // is exactly one of the three shapes, never a mix and never all-null.
    name: "0004_opinions_comparison_support",
    sql: `
      CREATE TABLE opinions_new (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stance TEXT NULL CHECK (stance IN ('BUY','PASS')),
        selected_option_id TEXT NULL REFERENCES purchase_options(id) ON DELETE CASCADE,
        selected_none INTEGER NOT NULL DEFAULT 0 CHECK (selected_none IN (0,1)),
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (post_id, user_id),
        CHECK (
          (stance IS NOT NULL AND selected_option_id IS NULL AND selected_none = 0)
          OR (stance IS NULL AND selected_option_id IS NOT NULL AND selected_none = 0)
          OR (stance IS NULL AND selected_option_id IS NULL AND selected_none = 1)
        )
      );
      INSERT INTO opinions_new (id, post_id, user_id, stance, selected_option_id, selected_none, comment, created_at, updated_at)
        SELECT id, post_id, user_id, stance, NULL, 0, comment, created_at, updated_at FROM opinions;
      DROP TABLE opinions;
      ALTER TABLE opinions_new RENAME TO opinions;
      CREATE INDEX idx_opinions_post ON opinions(post_id);
      CREATE INDEX idx_opinions_user ON opinions(user_id, created_at DESC);
      CREATE INDEX idx_opinions_option ON opinions(selected_option_id);
    `,
  },
  {
    // Optional, versioned context answers for a post (Feature A). Absent
    // entirely for a post that answered nothing — never a row of empty
    // strings, so "don't render blank cards" is true by construction at the
    // data layer, not just in the template.
    name: "0005_post_context",
    sql: `
      CREATE TABLE post_context (
        post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        category_key TEXT NOT NULL,
        answers TEXT NOT NULL DEFAULT '{}',
        free_text TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    // Feature E: the buyer's purchased option (WHICH_ONE posts only) and an
    // optional pointer at the single opinion they found influential. Both
    // nullable additions to the existing table — every pre-v2 outcome row
    // keeps its status/reflection/decided_at exactly as before.
    //
    // influential_opinion_id uses ON DELETE SET NULL deliberately (unlike
    // every other FK in this schema, which CASCADEs): the brief explicitly
    // requires "a deleted opinion must not leave a broken public reference"
    // — the default NO ACTION would instead make deleting an opinion that's
    // currently marked influential fail outright with a foreign-key
    // violation, which is worse than either outcome. SET NULL means the
    // outcome row survives and simply stops pointing at anything, which the
    // UI already renders correctly (no influential badge shown at all).
    name: "0006_outcome_extensions",
    sql: `
      ALTER TABLE post_outcomes ADD COLUMN purchased_option_id TEXT NULL REFERENCES purchase_options(id);
      ALTER TABLE post_outcomes ADD COLUMN influential_opinion_id TEXT NULL REFERENCES opinions(id) ON DELETE SET NULL;
    `,
  },
  {
    // Feature D (demo content) + Feature C (historical search). is_demo on
    // both posts AND users (a post inherits demo status from its author at
    // creation, but marking the user too means a query filtering "real
    // participation" never has to join back through posts for user-level
    // actions like registration or login) defaults to 0, so every existing
    // row is unambiguously real. The FTS5 table is populated explicitly from
    // db.ts on create/update/delete (never via SQL triggers) so every write
    // that touches the index is a visible, debuggable line of application
    // code.
    name: "0007_demo_and_search",
    sql: `
      ALTER TABLE posts ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1));
      CREATE INDEX idx_posts_is_demo ON posts(is_demo);
      ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1));

      CREATE TABLE demo_metadata (
        post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
        generation_method TEXT NOT NULL,
        model_identity TEXT NULL,
        generated_at TEXT NOT NULL,
        seed_version TEXT NOT NULL,
        validation_method TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE posts_search USING fts5(post_id UNINDEXED, title, description, context_text);
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
