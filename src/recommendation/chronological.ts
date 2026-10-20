// The only implementation shipped in this phase: a transparent, explainable
// feed with no machine learning and no hidden ranking. It is explicitly NOT
// a recommender — getFeedForUser degrades to the plain chronological/
// category feed when no interests are set, and getMatchingSignals only ever
// reports signals that are true by construction (shared category/tag,
// declared interest), never a learned score.
import { db, getUserInterests, listFeed, type Post } from "../db.ts";
import type { FeedResult, MatchingSignal, Pagination, RecommendationService } from "./types.ts";

function listRecentByCategories(categoryIds: string[], limit: number): Post[] {
  if (categoryIds.length === 0) return [];
  const placeholders = categoryIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM posts WHERE status = 'active' AND visibility = 'public' AND category_id IN (${placeholders})
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...categoryIds, limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    description: row.description,
    priceCents: row.price_cents,
    currency: row.currency,
    categoryId: row.category_id,
    tags: JSON.parse(row.tags),
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export class ChronologicalRecommendationService implements RecommendationService {
  getFeedForUser(userId: string | null, pagination: Pagination): FeedResult {
    // Phase-1 behaviour: if the viewer has declared interests AND is on the
    // first page (no cursor yet), lead with recent posts in those categories
    // before falling back to the plain chronological feed — transparent
    // category boosting, not a scored/learned ranking. Any later page just
    // continues the plain chronological feed so pagination stays simple and
    // never duplicates a post already shown.
    if (userId && !pagination.cursor) {
      const interests = getUserInterests(userId);
      if (interests.length > 0) {
        const boosted = listRecentByCategories(interests, pagination.limit ?? 20);
        if (boosted.length > 0) {
          const last = boosted[boosted.length - 1];
          return { posts: boosted, nextCursor: `${last.createdAt}|${last.id}` };
        }
      }
    }
    const page = listFeed({ cursor: pagination.cursor, limit: pagination.limit });
    return { posts: page.posts, nextCursor: page.nextCursor };
  }

  getRelatedPosts(postId: string, limit = 6): Post[] {
    const post = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId) as any;
    if (!post) return [];
    const rows = db
      .prepare(
        `SELECT * FROM posts WHERE status = 'active' AND visibility = 'public' AND category_id = ? AND id != ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(post.category_id, postId, limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      authorId: row.author_id,
      title: row.title,
      description: row.description,
      priceCents: row.price_cents,
      currency: row.currency,
      categoryId: row.category_id,
      tags: JSON.parse(row.tags),
      visibility: row.visibility,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getMatchingSignals(userId: string, postId: string): MatchingSignal[] {
    const post = db.prepare(`SELECT category_id, tags FROM posts WHERE id = ?`).get(postId) as any;
    if (!post) return [];
    const interests = new Set(getUserInterests(userId));
    const signals: MatchingSignal[] = [];
    if (interests.has(post.category_id)) {
      signals.push({ kind: "interest_match", label: `You follow this category`, weight: 1 });
    }
    return signals;
  }
}

export const recommendationService: RecommendationService = new ChronologicalRecommendationService();
