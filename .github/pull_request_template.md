## Summary

<!-- one paragraph: what was done and why -->

## Rules Applied

<!-- cite the SPEC/AIDO rules this change had to honor, e.g.
- AIDO §5.1 M1: money handled as Decimal
- AIDO §5.3 S5: all queries scoped by user_id
-->

## Tests

<!-- test name — what it proves — pass/fail. Coverage % for S4/S5/S9/S10/S11. -->

## Dependencies Added

<!-- none, or: name — justification. The stack is locked (AIDO §3). -->

## Open Questions

<!-- Anything needing human confirmation. Assumptions about FINANCIAL LOGIC go
     here, never under "assumptions" (AIDO §12). -->

## Definition of Done (AIDO §10)

- [ ] Compiles with `strict: true`, zero TypeScript errors
- [ ] ESLint + Prettier pass
- [ ] Unit tests written and passing (S4, S5, S9, S10, S11)
- [ ] No rule from AIDO §5 violated
- [ ] All queries scoped by `user_id`
- [ ] All money handled as `Decimal`
- [ ] `.env.example` updated if new env vars were added
- [ ] `SPEC.md` updated if behavior changed
- [ ] No secrets, real emails, or real financial data committed
