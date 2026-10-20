// Shared types for the recommendation subsystem. Kept separate from
// implementations so a future ranking model can be swapped in without
// touching callers — see docs/research/RECOMMENDATION_ROADMAP.md for the
// evaluation of what that future model might be (not built here).
import type { Post } from "../db.ts";

export interface Pagination {
  cursor?: string;
  limit?: number;
}

export interface FeedResult {
  posts: Post[];
  nextCursor: string | null;
}

export interface MatchingSignal {
  kind: "shared_category" | "shared_tag" | "interest_match";
  label: string;
  weight: number;
}

/**
 * The replaceable surface between "the feed" and "how posts are ranked."
 * CRITICAL (see RECOMMENDATION_ROADMAP.md): a user's BUY/PASS stance on a
 * post is an opinion about whether someone else should buy that item, not a
 * signal of the voter's own interest in the category — an implementation
 * must never fold stance into a user's interest/affinity model.
 */
export interface RecommendationService {
  getFeedForUser(userId: string | null, pagination: Pagination): FeedResult;
  getRelatedPosts(postId: string, limit?: number): Post[];
  getMatchingSignals(userId: string, postId: string): MatchingSignal[];
}
