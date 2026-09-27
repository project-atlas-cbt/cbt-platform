# Subject-Access, Correction, De-identification, and Deletion Procedure

**Status:** Draft for legal review

1. **Receive through the school.** Direct an individual requester to the relevant school unless law
   requires the processor to act directly.
2. **Create a restricted case.** Record the controller, requester reference, request type, date,
   deadline, affected school, and assigned operator. Do not place request evidence in ordinary logs.
3. **Verify instruction.** Require written confirmation from an authorized School Admin and the
   school's verification of the requester. Platform support does not infer authority from identifiers
   supplied by the requester.
4. **Scope by tenant.** Resolve every search under the school tenant. Cross-school searches require
   audited Software Admin break-glass access.
5. **Export.** Produce a private, requester-bound export through the B18 reporting path. Include
   identity, enrollment, participation, attempts, results, and relevant audit history that the
   controller is entitled to disclose. Exclude other students and security secrets.
6. **Correction.** Correct mutable identity fields through existing audited workflows. Never rewrite
   attempts, answer events, snapshots, result provenance, or historical class context.
7. **Deletion/de-identification assessment.**
   - Delete only operational artefacts whose retention period has elapsed.
   - Do not delete protected academic or audit evidence.
   - Where counsel and the controller approve, replace mutable direct identifiers with a stable
     pseudonym while preserving relationships and provenance.
8. **Dual review.** A second authorized operator reviews scope, exclusions, and destination before
   release or de-identification.
9. **Deliver securely.** Use a short-lived, requester-bound download capability. Do not email raw
   exports as attachments.
10. **Record completion.** Append an audit event and record the controller's confirmation, data
    released, actions taken, exclusions, and legal rationale.

Requests involving erasure of academic evidence are escalated to privacy counsel and the controller;
engineering must not create an ad-hoc hard-delete path.
