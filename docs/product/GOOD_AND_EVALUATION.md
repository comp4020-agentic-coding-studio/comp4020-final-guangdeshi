# Definition of Good and how it's evaluated

## The statement

**Good advice is relevant, honest, and easy to give.**
**The purchase belongs to the buyer. The opinions belong to the community.**

This is the single sentence every design and engineering decision in this
repository traces back to. See `README.md` for the full elaboration into
eight concrete implications (low friction, clear position, human context,
accountability, buyer agency, real-time social value, honest results,
relevance without gatekeeping).

## How each implication is actually enforced, not just claimed

| Implication | Enforcement mechanism | Where |
|---|---|---|
| Low friction | One stance + one comment + one submit button; no multi-step opinion wizard | `src/pages.ts` `postDetailPage`'s opinion form |
| Clear position | `stance` column has a `CHECK (stance IN ('BUY','PASS'))` constraint — no third "neutral" value exists in the schema | `src/migrations.ts` |
| Human context | `description` is a required field on every post, validated non-empty | `src/validation.ts` `validatePostInput` |
| Accountability | `UNIQUE(post_id, user_id)` database constraint, not just an app-level check | `src/migrations.ts`, `src/db.ts` `upsertOpinion` |
| Buyer agency | No aggregate "verdict" field or endpoint exists anywhere in the schema or API; post authors are blocked server-side from voting on their own post | `src/server.ts` `handleSubmitOpinion` |
| Real-time social value | SSE push on every opinion/count/outcome change, measured <1s in `spec/realtime.test.ts` | `src/sse.ts`, `spec/realtime.test.ts` |
| Honest results | Counts are always a live `COUNT(*) ... GROUP BY stance` query, never cached or pre-seeded | `src/db.ts` `getOpinionCounts` |
| Relevance without gatekeeping | The feed can boost a user's declared interest categories, but `submitOpinion` has no interest/expertise check at all — anyone logged in can opine on anything | `src/server.ts` `handleSubmitOpinion`, `src/recommendation/chronological.ts` |

## What's explicitly NOT built, and why that's a "good" decision here

See `docs/product/PRODUCT_BRIEF.md`'s non-goals list. Each omission is a
direct consequence of "easy to give": a blind-voting phase, a formal debate
round, or a mandatory questionnaire would all make giving an opinion slower
and more effortful, trading "easy" for a process that resembles formal
review — which this product is explicitly not.

## How this gets checked, not just argued

- `spec/posts-and-opinions.test.ts` exercises the accountability rule under
  concurrent load (8 simultaneous submissions from one user collapse to
  exactly one opinion row) and the buyer-agency rule (an author's own
  opinion-submission attempt is rejected with 403).
- `spec/realtime.test.ts` measures actual SSE propagation latency rather
  than asserting "it should be fast."
- `spec/uploads.test.ts` checks that a fabricated/corrupt file claiming to be
  an image is rejected by actual decode failure, not by trusting the
  declared `Content-Type` — relevant to "honest results" extended to media,
  not just vote counts.

## Known tensions and how they were resolved

- **Relevance vs. gatekeeping.** A tempting design would require some
  "expertise" signal before letting a user opine on, say, a specialist
  computing purchase. This was deliberately rejected: README's point H is
  explicit that lacking a badge must never block giving an opinion. Interest
  categories only ever affect which posts are *surfaced* to a user by
  default, never who may respond.
- **Real-time vs. simplicity of the stack.** SSE (not WebSockets) was chosen
  specifically because every live event here is server→client only; adding
  bidirectional WebSocket machinery would be complexity this product doesn't
  need. See `docs/architecture/REALTIME_AND_LOGGING.md`.
