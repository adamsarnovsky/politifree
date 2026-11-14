# Contributing

Report both misses and false removals in Issues. Explain the intended result and give a public reproduction or a minimal synthetic fixture. Do not post private account content or someone else's personal information. Disagreeing with a viewpoint is not sufficient evidence for a rule; apply the same political-content criteria regardless of party.

## Review and release

1. Triage the report: reproduce, label political/ordinary/uncertain, and note media type. Uncertain evidence must not be relabeled as verified.
2. Propose a narrow rule in `filters/rules.json`, with a unique ID, exact normalized text, exact hostname, action and explanation. For text-only false removals use `allow`; for mixed media or broad context bugs change the source instead.
3. Add a matching example and at least one nonmatching ordinary lookalike to `filters/cases.json` for every rule. Each case has `rule`, `host`, `text`, `hasMedia`, and `expected` (`block`, `allow`, or null). Include a real regression fixture for code changes.
4. Maintainer reviews the PR and runs tests. Contributions do not have access to the signing key. CODEOWNERS requests owner review, but is not a substitute for repository branch-protection enforcement.
5. Increment the revision, sign with the offline key using `node scripts/sign-filters.cjs filters/rules.json /private/filter-signing.pem filters/current.json`, then run all checks. Commit the reviewed rules, cases and signed envelope together. Publish on main only after review.
6. Clients reject invalid signatures and revisions at or below their highest accepted revision. For a global rollback publish a *higher* revision containing the last known-good rules. Local rollback restores the previous pack and pauses automatic checks, preserving the anti-replay high-water mark.

Signing key: kept outside this repository on the maintainer's machine. Back it up privately. Never attach it to issues, logs, public actions artifacts or source. Key rotation requires shipping a new extension with the new public key. The initial configuration points to this repository's signed `filters/current.json`; forks must use their own endpoint and key.

## Maintainer checklist

- No private captures or credentials in commits; review the complete staged diff.
- Positive and negative tests pass; ordinary content is not globally exempted by a broad name match.
- Changes to reporting/privacy and signing require explicit review.
- Configure branch protection for main to require Checks and owner review where the GitHub account plan supports it. Do not claim protections are enforced until configured and verified.
- Never execute or install code from an issue report simply because the report asks you to.
