# Competitor analysis

## Comparison set

| Product | What it's for | How it's similar to Buy or Pass | How it differs |
|---|---|---|---|
| Reddit (e.g. r/BuyItForLife, product subreddits) | General discussion, including "should I buy X" posts | Community opinions on a specific purchase; upvote/downvote as a coarse signal | No structured stance (upvote isn't "I'd buy this"); no purchase-outcome follow-up loop; comments aren't tied to an explicit Buy/Pass stance |
| Amazon/retailer reviews | Post-purchase quality feedback on a specific product listing | Opinions tied to a specific product | Reviews are about products already bought, not a pre-purchase decision; no "should I buy this" framing; reviewer and asker are never the same relationship as here |
| Is It Worth It? / Should I Buy This? (various niche apps) | Pre-purchase decision support | Same core question framing | Typically either a solo pro/con checklist tool (no community) or a poll tool with no structured opinion/comment pairing |
| Twitter/X "RT if I should buy this" threads | Informal crowd-sourced purchase opinions | Fast, informal, real people | No structure at all — no stance field, no comment requirement, no persistent record tied to a profile, no purchase-outcome follow-up |
| Polymarket / prediction markets | Aggregate many people's judgment into a single number | Aggregating distinct opinions | Explicitly about probability/price discovery, not personal advice; no individual accountability for an opinion's content, pure numeric aggregation |

## What Buy or Pass does differently

1. **An opinion is structured, not freeform.** Every opinion pairs an
   explicit binary stance (BUY/PASS) with exactly one short comment — neither
   a vote with no reasoning (Reddit upvotes, RT threads) nor an unstructured
   long-form review (Amazon reviews).
2. **The question is framed around a specific person's specific decision**,
   not a general product rating. The post's required "why you're considering
   this" field means opinions can respond to fit-for-purpose, not just
   general product quality — something a star rating or a generic forum
   thread doesn't capture.
3. **A closed-loop follow-up.** None of the compared products ask the
   original poster to come back and record what they actually decided.
   Buy or Pass's optional Bought/Didn't Buy/Still Deciding follow-up closes
   the loop the other products leave open.
4. **Accountability without permanence.** One current opinion per account
   per post (enforced by a database constraint) means an opinion reflects
   someone's current view, not a pile of duplicate or stale votes — closer
   to a considered individual judgment than an anonymous upvote tally.

## What's deliberately NOT borrowed from these products

- **No karma/reputation score** (Reddit-style). Per the Definition of Good's
  "relevance without gatekeeping," an opinion's validity doesn't depend on
  the opinion-giver's history or standing.
- **No star rating / numeric aggregate score** (Amazon-style). Counts are
  shown as raw Buy/Pass counts, not collapsed into a single "4.2/5" that
  implies false precision or an algorithmic verdict.
- **No market-style price mechanism** (Polymarket-style). This isn't about
  predicting an outcome or aggregating into a probability; it's about
  surfacing individual honest opinions for a human to read and weigh
  themselves.
