# Freemium and subscription plan design for VTTs and comparable hobby SaaS

Research date: 2026-11-10. Several official pricing pages (roll20.net help center, wiki.roll20.net, owlbear.rodeo/pricing, forge-vtt.com/plans, World Anvil) blocked automated fetches (HTTP 403 or empty), so some current prices come from third-party listings or older developer posts. Dates are flagged on every item where known.

## (a) Which limits in VTT free tiers drive conversion without killing adoption

### Takeaway

The dominant VTT pattern is "everything needed to play a session is free; what costs the operator money (storage, bandwidth, server capacity) or what power-GMs need (automation, advanced lighting, more campaigns, content sharing) is paid." Storage quota is the near-universal lever (100–125 MB free is the common floor). Feature gates on core table play (dynamic lighting at Roll20) work commercially but are the most criticized.

### Cited Findings

**Roll20**

- Free tier: 100 MB storage, with ads. Pro listed at $8.33/mo or $99.99/yr, 10 GB storage, 100 MB max upload; Elite $12.50/mo or $149.99/yr, 50 GB (third-party listing that says it checked Roll20 pages on 2026-09-30; no Plus tier shown there) — [macmyths.com](https://macmyths.com/apps/roll20/)
- Conflicting older/undated figures: Roll20 help center gives Free 100 MB, Plus 4 GB, Pro $10.99/mo or $109.99/yr — [Roll20 Help Center](https://help.roll20.net/hc/articles/360037774633) (page returned 403 to fetch; figures from search snippet); EN World reported a price increase Plus $4.99→$5.99/mo and Pro $9.99→$10.99/mo — [EN World](https://www.enworld.org/goto/post?id=8264137); CyberPost (Feb 2026) lists Plus ~$5/mo with 3 GB and Pro ~$10/mo with 10 GB — [CyberPost](https://cyberpost.co/?p=1334771). Treat current Plus price/storage as unconfirmed.
- Elite tier launched 2025-10-22 at $150/yr: all Pro features (Dynamic Lighting, API access, Roll20 Reserve rewards), storage 10 GB → 50 GB, compendium sharing across 20 games with up to 15 players each (300 player slots), plus Dungeon Scrawl Pro (valued $60/yr). Free, Plus and Pro "remain unchanged" — [GeekNative](https://www.geeknative.com/210141/roll20-adds-new-150-subscription-aimed-at-high-usage-game-masters/); [Roll20 forum announcement](https://app.roll20.net/forum/post/12542863/introducing-roll20-elite-5x-storage-4x-sharing-and-more)
- Dynamic lighting is gated by the GM's subscription; free GMs can only use Fog of War — [Roll20 forum](https://app.roll20.net/forum/permalink/10108108/); [Roll20 forum](https://app.roll20.net/forum/permalink/10274659/)
- In a 2021 promotion all accounts got dynamic lighting temporarily; a moderator said the point was "to entice free players to consider upgrading" — [Roll20 forum](https://app.roll20.net/forum/permalink/10281018) (from search snippet)

**Owlbear Rodeo**

- Design principle (blog, 2022-05-27): "All features required to play a game are available in all tiers." Only features with monthly hosting cost vary by tier: cloud storage and custom rooms. Free tier 100 MB (author considered Astral Tabletop's 1 GB free too high). No ads, even for free users, for privacy; paid users subsidize free users — [Owlbear Rodeo blog](https://blog.owlbear.rodeo/state-of-the-rodeo-lets-talk-about-subscriptions)
- Owlbear 2.0 tiers (Dev Log 6, undated, ~2023): Nestling moved from $3/mo to free with 100 MB; Fledgling $5 → $3.99/mo or $39.99/yr, 5 GB, all features; Bestling $10 → $7.99/mo or $79.99/yr, 10 GB plus more Custom Rooms — [Owlbear Rodeo 2.0 Dev Log 6](https://blog.owlbear.rodeo/owlbear-rodeo-2-0-dev-log-6/). Current pricing page was not fetchable; not confirmed for 2026.

**Foundry VTT / The Forge**

- Foundry: one-time $50 license per host, unlimited players; only the host buys — [Foundry FAQ](https://foundryvtt.com/article/faq/)
- The Forge: player tier "Free, Forever", no Foundry license needed to join; GM plans from $3.99/mo with a 14-day trial; storage cited as 5 GB free up to 75 GB on top tier (may be out of date) — [Forge plans](https://forge-vtt.com/plans); [Foundry partners page](https://foundryvtt.com/article/partnerships/). Owlbear's dev explicitly contrasted itself with Forge, which "requires a paid tier to host games" — [Owlbear Rodeo blog](https://blog.owlbear.rodeo/state-of-the-rodeo-lets-talk-about-subscriptions)

**Shard Tabletop** (article dated 2024-10-07)

- Free: basic functions, up to 6 characters; expanded 5e options need a subscription. Adventurer $2.99/mo: unlimited characters, 2 active campaigns, fancier dice, share owned content in 1 campaign. Gamemaster $5.99/mo: 6 active campaigns, token swapping, split screen, watch mode, share across 5 campaigns. Gamemaster Pro $9.99/mo: unlimited active campaigns — [Gnome Stew](https://gnomestew.com/shard-tabletop-vtt-impressions/)
- A 2025 blog said free players can have up to 6 characters and join one game, and called it "fair... enough to get players sold" — [sbrpg20 blog, May 2025](https://sbrpg20.blogspot.com/2025/05/youtube-shard-vtt.html) (from search snippet)

**Alchemy RPG**

- At v1 launch (April 2023) Alchemy launched a "Free Unlimited" membership; earlier free accounts limited the number of characters and campaigns — [Know Direction press release](https://knowdirectionpodcast.com/2023/04/press-release-alchemy-rpg-announces-version-one-release/)
- When Alchemy Unlimited lapses, characters, games and assets beyond the free limit remain usable (help center, via search snippet; page now 404) — [Alchemy help](https://help.alchemyrpg.com/en/articles/9823689-alchemy-unlimited)

**Quest Portal** (current pricing page, fetched 2026-11-10)

- 30-day trial with all Pro features, no card; after trial campaigns become read-only, nothing deleted, nothing auto-charged. Core: $29.99 one-time ("Pay once, yours for good") or $2.99/mo — scenes, maps, dice, sheets, initiative, scheduling, chat, voice, apps. Pro: $89.99/yr (~$7.50/mo, "save 25%"); AI features (GM assistant, PDFs, AI notes, session recording/transcripts, Claude/ChatGPT/MCP connection), 1,200 AI credits/mo. Players free with a Core or Pro GM — [Quest Portal pricing](https://www.questportal.com/pricing). Launch post earlier listed Pro at $8/mo or $6/mo annual — [Quest Portal blog](https://www.questportal.com/blog/launching-quest-portal)

**Let's Role** (blog dated 2024-10-03)

- Free users capped at 125 MB of media; those over keep their media but must delete or subscribe to upload more. New "Explorer" Play Pass €2/mo billed annually only (€24/yr): 500 MB, 3 skins, Discord role, no ads in the mobile app; higher tiers Traveler and Adventurer add more skins. Plan switching without fees, paid amount credited — [Let's Role blog](https://lets-role.com/blog/subscription-changes-119)

### Inferences

- Storage is the safest primary gate: it maps directly to the operator's real cost, it is invisible until a GM is invested (has uploaded maps), and every surveyed VTT uses it. 100–125 MB free is the market floor (Roll20, Owlbear, Let's Role).
- Second-tier levers that appear frequently: number of active campaigns (Shard, earlier Alchemy), content-sharing breadth (Roll20 Elite, Shard), server capacity/custom rooms (Owlbear), automation/API (Roll20 Pro), AI (Quest Portal Pro). Cosmetics (dice skins, sheet skins) are used as low-tier sweeteners (Shard, Let's Role).
- "Read-only, never deleted" on lapse (Quest Portal, Alchemy) is emerging as the norm for downgrade handling.

### Gaps

- Could not fetch current official Roll20, Owlbear, Forge pages; current Roll20 Plus price/storage and Owlbear 2026 prices unconfirmed.
- No published per-VTT conversion data found (Roll20, Owlbear, Alchemy do not disclose).
- No current Alchemy Unlimited price found.

## (b) What users resent being paywalled

### Takeaway

The strongest backlash in this space comes from (1) caps that retroactively trap content users already built (Kanka entity cap), (2) gating core table-play features behind the GM's wallet while marketplace content implies they work (Roll20 dynamic lighting), and (3) ads/privacy. Reversals and grandfathering defuse backlash.

### Cited Findings

- Kanka (2022-07): proposed a cap on entities per free campaign plus member/role/link restrictions. After community feedback the entity cap was dropped; other limits kept. Users called it predatory and a potential "rug pull" that trapped people with large campaigns; short notice criticized; a yearly paying subscriber said they would cancel over lost trust. Data: ~9,000 active campaigns, only 295 unboosted ones (~3%) above 300 entities would have been affected. Founders cited being overworked and underpaid and burnout risk — [Kanka blog](https://blog.kanka.io/2022/07/16/thoughts-on-the-discussions-surrounding-changes-to-the-free-tier)
- Roll20: buyers complained marketplace modules implied dynamic lighting worked for everyone; "the dynamic lighting lines and light sources are already in the modules, they just don't do anything" without a subscription — [Roll20 forum](https://app.roll20.net/forum/permalink/9905939) (search snippet, date unknown); users objected that dynamic lighting was only for paying tiers — [Roll20 forum](https://app.roll20.net/forum/permalink/83640)
- Roll20 Elite launch (Oct 2025): the main complaint was perceived removal of Dungeon Scrawl access from free users (staff denied: free features remain); also a billing bug charging annual plans monthly; skeptics questioned who would upgrade — [Roll20 forum announcement](https://app.roll20.net/forum/post/12542863/introducing-roll20-elite-5x-storage-4x-sharing-and-more)
- Roll20 r/Roll20 2024 post: a paying user asked why they, "the guy paying for premium," didn't get the feature in someone else's game — illustrating confusion over whose subscription governs a game — [r/Roll20 mirror](https://lr.eu.psf.lt/r/Roll20/comments/199rx0w/why_do_i_the_guy_paying_for_premium_not_get_to/kifw78x/?context=3)
- Owlbear rejected ads entirely for privacy and kept all play features free; it also explicitly framed the Forge's "pay to host" as the model it wanted to avoid — [Owlbear Rodeo blog](https://blog.owlbear.rodeo/state-of-the-rodeo-lets-talk-about-subscriptions)
- Let's Role grandfathered free users already over the new 125 MB cap (kept media, blocked new uploads) — [Let's Role blog](https://lets-role.com/blog/subscription-changes-119)
- D&D Beyond: subscriber "Drops" content excluded from Content Sharing; Vice covered the change and a commitment to sell yearly Drops bundles after backlash — [Vice](https://www.vice.com/en/article/dungeons-and-dragons-dd-beyond-announces-changes-to-content-drops/)

### Inferences

- Never introduce a cap that retroactively breaks existing data; grandfather (Let's Role) or apply only to new growth. The Kanka numbers show even a cap touching ~3% of campaigns provokes outsized trust damage.
- Gating a feature that is visible in shared content (lighting data embedded in maps) creates perceived bait-and-switch; if gated, make the gate explicit in the UI.
- Ads in a hobby VTT are a negative differentiator; Owlbear uses "no ads" as a value proposition.

### Gaps

- Did not retrieve direct Reddit threads from r/rpg, r/FoundryVTT, r/DnD on pricing sentiment (search returned mostly Roll20 forums); sentiment evidence is anecdotal forum posts, not surveys.

## (c) "Who pays": GM pays and players join free vs per-seat

### Takeaway

"GM pays, players free" is effectively universal among VTTs. Per-seat pricing was not found in any surveyed VTT. The GM's tier typically governs the game's feature set (Roll20, Quest Portal), and content sharing from the GM's library to players is a key paid perk scaled by tier (Roll20 Elite, Shard, D&D Beyond Master).

### Cited Findings

- Roll20: "the DM's level of subscription sets the privileges for the campaign"; players see dynamic lighting without being subscribers; only the GM needs Plus/Pro — [Roll20 forum](https://app.roll20.net/forum/permalink/10274659/); [Roll20 forum](https://app.roll20.net/forum/permalink/10108108/)
- Roll20 Elite: compendium sharing to 20 games × 15 players — [GeekNative](https://www.geeknative.com/210141/roll20-adds-new-150-subscription-aimed-at-high-usage-game-masters/)
- Quest Portal: players free with a Core or Pro GM; players only pay for their own AI tools — [Quest Portal pricing](https://www.questportal.com/pricing)
- Foundry: one $50 license by the host covers unlimited players — [Foundry FAQ](https://foundryvtt.com/article/faq/); The Forge: player accounts free forever — [Forge plans](https://forge-vtt.com/plans)
- Shard: sharing scope scales by tier (1 campaign at $2.99, 5 at $5.99) — [Gnome Stew](https://gnomestew.com/shard-tabletop-vtt-impressions/)
- D&D Beyond Master Tier: any Master subscriber in a campaign can share purchased content with the campaign; Master reported at $4.58/mo, Hero $2.17/mo — [D&D Beyond support](https://dndbeyond-support.wizards.com/hc/en-us/articles/46363179646356-What-does-a-Master-Tier-subscription-give-me); [ComicBook.com](https://comicbook.com/gaming/news/dungeons-dragons-dnd-just-dropped-a-ton-of-new-content-for-players-dms-and-its-just-the-beginning/) (article date not shown)
- Owlbear: tiers differ only on storage and custom rooms; the blog does not describe player-side payment — [Owlbear Rodeo blog](https://blog.owlbear.rodeo/state-of-the-rodeo-lets-talk-about-subscriptions)

### Inferences

- Rationale (inferred): the GM is the buyer with intent (prep, assets, running multiple tables); players are the viral loop — each GM brings 3–6 players for free, and some players become GMs. Charging players would break the invite flow.
- Player-side monetization exists but is optional and personal: cosmetics (Let's Role skins, Shard dice), personal storage, personal AI (Quest Portal).
- Clarity about "whose subscription governs this game" matters (see Roll20 confusion in (b)).

### Gaps

- No public data on what share of revenue comes from players vs GMs in any VTT.

## (d) Monthly vs semiannual vs annual discounts and lifetime deals

### Takeaway

Annual discounts in this space cluster at ~16.7% ("2 months free": Owlbear $3.99/$39.99, $7.99/$79.99; LegendKeeper $9/$90) up to ~25% (Quest Portal Pro). Roll20 Pro at $10.99/mo vs $109.99/yr (help center figures) is ~17%; the macmyths "$8.33/mo" is just the annual price divided by 12, not a separate monthly price. Semiannual plans are rare (D&D Beyond historically; Alchemy backer codes). Lifetime/one-time options exist in VTTs (Foundry $50, Quest Portal Core $29.99) but are risky for products with ongoing hosting cost; mitigations are to keep lifetime to the low-cost core and keep storage/AI as recurring.

### Cited Findings

- Recurly: most popular annual discount is 16.7%, i.e. "two months free"; >30% devalues the monthly plan, <10% gives no motive to go annual — [Recurly research](https://recurly.com/research/saas-benchmarks-for-subscription-plans); [Recurly 2018 analysis](https://recurly.com/blog/monthly-vs-yearly-pricing-an-analysis/) (2018 data)
- Baremetrics: average annual-plan discount among its customers ~9% — [Baremetrics](https://baremetrics.com/academy/perfect-pricing-benchmarks-and-best-practices) (date not verified)
- VTT/hobby examples: Owlbear Fledgling $3.99/mo or $39.99/yr ("two months free"), Bestling $7.99/$79.99 — [Owlbear Dev Log 6](https://blog.owlbear.rodeo/owlbear-rodeo-2-0-dev-log-6/); Quest Portal Pro $89.99/yr "save 25%" — [Quest Portal pricing](https://www.questportal.com/pricing); LegendKeeper Pro $9/mo or $90/yr — [LegendKeeper pricing](https://www.legendkeeper.com/pricing); Let's Role Explorer annual-only €24/yr — [Let's Role blog](https://lets-role.com/blog/subscription-changes-119); Obsidian Sync Standard $4/mo annual ($48) vs $5 monthly ($60), Plus $8/mo annual ($96) vs $10 monthly ($120), i.e. 20% off — [Obsidian pricing](https://obsidian.md/pl/pricing); [Subger](https://subger.com/en/service/obsidian-sync)
- Semiannual: D&D Beyond historically offered Master Tier $5.99/mo, $29.99/6 mo, $54.99/yr (older, outdated pricing) — [Nerdarchy](https://nerdarchy.com/dd-beyond-pricing-announced-and-a-bunch-of-other-stuff-too); Alchemy distributed 6-month, 1-year and lifetime Unlimited codes to backers — [Alchemy BackerKit updates](https://alchemyrpg.backerkit.com/hosted_preorders/project_updates?page=3)
- Churn: annual vs monthly churn figures circulating (e.g., 8% vs 32% annualized; 5–10% vs 30–50%) come from vendor blogs without cited datasets — [Monetizely](https://www.getmonetizely.com/articles/monthly-vs-annual-billing-how-subscription-length-impacts-saas-churn-and-cash-flow); [GrowthSpree 2026](https://www.growthspreeofficial.com/blogs/b2b-saas-annual-contract-length-multi-year-discount-benchmarks-2026-impact-on-retention-payback) (B2B, "2–3x lower churn"). Treat as directional only.
- Lifetime deal risks: Freemius advises against LTDs when costs are usage-driven (hosting, AI, APIs) or you can't cover permanent infrastructure costs — [Freemius](https://freemius.com/blog/saas-lifetime-deals/); SaaSClub playbook estimates a ~2-year window before server/data costs consume LTD revenue — [SaaSClub](https://saasclub.io/playbooks/george-georgiadis-lifetime-deals-framework/); AppSumo refund rates ~16–17% reported by a founder — [Indie Hackers](https://indiehackers.com/post/the-45k-sugar-rush-what-110k-in-appsumo-gross-revenue-taught-us-0383952b35); a founder argued a permanent LTD is unsustainable due to ongoing server costs — [AppSumo Q&A](https://go.appsumo.com/products/tastewp/questions/if-this-was-a-ltd-i-would-have-bought-i-1331285)
- Owlbear's dev rejected a one-time model (like Foundry's) because it depends on new-user growth or new features, preferring steady subscription income to fund polish and hosting — [Owlbear Rodeo blog](https://blog.owlbear.rodeo/state-of-the-rodeo-lets-talk-about-subscriptions)

### Inferences

- Annual at "2 months free" (16.7%) is the defensible default; 20–25% is on the generous end. A semiannual plan, if offered, would logically sit between (e.g., ~8–10% off) but there is little modern VTT precedent.
- Quest Portal's split (one-time Core for the low-cost core; recurring Pro for AI/costly features) is the cleanest template for offering a "lifetime" option without exposing open-ended hosting costs. Foundry can sell one-time only because the user self-hosts.

### Gaps

- No ProfitWell/Paddle primary data on annual vs monthly churn retrieved (the search surfaced only secondary vendor blogs).
- No discount data specific to Brazil/BRL pricing.

## (e) Typical freemium conversion rates

### Takeaway

For self-serve freemium, 3–5% free-to-paid is "good" and 6–8% "great" (OpenView/Lenny 2023, B2B-leaning dataset); a fifth of freemium products convert under 2.5%. Free trials convert higher (8–12% good). No consumer-hobby/VTT-specific benchmarks were found.

### Cited Findings

- Lenny's Newsletter / Kyle Poyar (2023-08-01), survey of 1,000+ products with OpenView, Growth Unhinged, Pendo; 6-month conversion window: freemium self-serve good 3–5%, great 6–8%; freemium sales-assisted good 5–7%, great 10–15%; free trial good 8–12%, great 15–25%. Freemium distribution: 20% below 2.5%, 33% between 2.5–5%, ~15% above 20%. Free trial: most common bucket 7.5–10% (~24%). Developer-focused median 5%. Dataset is B2B SaaS from prosumer/micro-SMB to enterprise; no consumer split — [Lenny's Newsletter](https://lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion); full report [OpenView 2023 Product Benchmarks](https://openviewpartners.com/2023-product-benchmarks)
- CrazyEgg repeats the 3–5% / 6–8% freemium figures and notes 2% might be strong for enterprise but weak for a consumer app — [CrazyEgg](https://www.crazyegg.com/blog/free-to-paid-conversion-rate/)

### Inferences

- For a hobby VTT where the free tier is generous and players are free by design, the relevant denominator is GMs, not all accounts; conversion over all accounts would look far lower than 3–5% because most accounts are players.
- Quest Portal's "30-day full trial then read-only" is a trial-style hybrid, which per the benchmarks tends to convert higher than pure freemium.

### Gaps

- No ChartMogul or Paddle consumer freemium conversion figures retrieved; no disclosed conversion rates for any VTT.

## (f) Comparable hobby/creator SaaS and supporter/early-adopter models

### Takeaway

Hobby worldbuilding/notes tools price paid tiers in the ~$4–10/mo range with storage and premium features as gates. Supporter/backer models in VTTs (Alchemy Kickstarter lifetime, Owlbear Patreon era) funded early development; Owlbear moved off Patreon because rewards distracted from product work.

### Cited Findings

- Kanka: generous free tier; paid from ~$4.16/mo billed yearly, adding larger map uploads, premium campaign features, no ads — [Kanka](https://kanka.io/v2) (via search snippet); a Kanka subscriber cited $165/yr for the Owlbear tier (2022) — [Kanka blog](https://blog.kanka.io/2022/07/16/thoughts-on-the-discussions-surrounding-changes-to-the-free-tier)
- World Anvil: free Freeman tier; Master $4.50/mo, Grandmaster $8.25/mo, Sage $25/mo billed annually (sources disagree; official page blocked) — [Kindlepreneur](https://kindlepreneur.com/world-anvil/)
- LegendKeeper: Pro $9/mo or $90/yr, 14-day trial no card; free Basic for viewing/collaborating on others' projects; lapsed subscribers keep view/export — [LegendKeeper pricing](https://www.legendkeeper.com/pricing)
- Obsidian: app free for personal use; Sync is the paid add-on ($4–5/mo Standard, $8–10/mo Plus with 10 GB) — [Obsidian pricing](https://obsidian.md/pl/pricing)
- Notion Plus ~$10–12/user/mo; free plan has 5 MB file uploads and 7-day page history (aggregator) — [Costbench](https://costbench.com/compare/notion-vs-obsidian/)
- Roll20 Elite ($150/yr) functions as a high anchor above Pro; forum skeptics questioned who would buy it — [Roll20 forum](https://app.roll20.net/forum/post/12542863/introducing-roll20-elite-5x-storage-4x-sharing-and-more)
- Alchemy Kickstarter: top "Hail Mary" tier gave lifetime access, >200 backers; physical tiers included Unlimited time; campaign ~$740,619 from ~4,516–4,522 backers, called the top-grossing VTT crowdfunding ever; 2022 Founder Box gave a year of Founder Tier, discount and dev Discord — [Bell of Lost Souls](https://www.belloflostsouls.net/?p=487753); [Kicktraq](https://www.kicktraq.com/projects/alchemyrpg/alchemy-rpg-a-reimagined-vtt-experience/); [BackerKit project](https://www.backerkit.com/projects/alchemyrpg/alchemy-rpg-a-reimagined-vtt-experience)
- Owlbear's Patreon covered server costs (~$100–200/mo at one point) but rewards pushed the team toward blog posts instead of product, motivating the move to subscriptions — [Owlbear Rodeo blog](https://blog.owlbear.rodeo/state-of-the-rodeo-lets-talk-about-subscriptions)

### Inferences

- Price anchors for a hobby VTT: entry paid tier ~$3–5/mo, mid ~$6–10/mo, power tier ~$12–15/mo (or $150/yr). Lifetime offers at launch work best capped in count/time and limited to a bounded cost scope.

### Gaps

- Discord Nitro and Canva Pro current prices not verified (only aggregators with unclear tiers). No outcome data (revenue, churn) on Alchemy lifetime backers. No Let's Role full tier prices beyond Explorer.
