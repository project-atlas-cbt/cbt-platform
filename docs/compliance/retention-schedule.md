# Data Retention Schedule

**Status:** Provisional engineering schedule—legal approval required by ADR-0028
**Review triggers:** Counsel decision, B21 storage measurements, regulatory/customer residency
requirements, material schema changes

| Record class                                    | Retention                  | Disposal/action                                                 | Rationale                                                |
| ----------------------------------------------- | -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Attempts, snapshots, answers, answer events     | Indefinite                 | No automated deletion                                           | Protected academic evidence                              |
| Marking rows, results, adjustments, publication | Indefinite                 | No automated deletion                                           | Result provenance and correction history                 |
| Academic sessions, enrollment, assignments      | Indefinite                 | Archive/inactivate only                                         | Historical academic context                              |
| Audit events                                    | Indefinite pending counsel | Append-only; no product deletion                                | Security and administrative evidence                     |
| Question revisions and reviews used by exams    | Indefinite                 | Archive only                                                    | Historical question integrity                            |
| Orphaned or superseded media                    | Report only                | No automated deletion                                           | ADR-0028/D-13 gate                                       |
| Expired school sessions                         | 30 days after expiry       | Automated deletion                                              | Authentication artefact; investigation buffer            |
| Expired platform sessions                       | 30 days after expiry       | Automated deletion                                              | Authentication artefact; investigation buffer            |
| Expired/used password-reset tokens              | 30 days after expiry       | Automated deletion                                              | Credential artefact; abuse investigation buffer          |
| Idempotency cache entries                       | Existing 24-hour TTL       | Redis expiry                                                    | Request replay protection only                           |
| Import staging records/files                    | Existing 24-hour lifecycle | Existing expiry transition; file deletion awaits storage policy | A-17 pipeline                                            |
| Export artefacts                                | Existing 24-hour expiry    | Capability invalidation; object deletion verified in B22/B23    | High-sensitivity generated data                          |
| Application logs/traces                         | 30 days proposed           | Backend lifecycle policy                                        | No bodies/answers/credentials; counsel approval required |
| Security incidents                              | Counsel-defined            | Restricted archive                                              | Legal/accountability evidence                            |

The B20 retention worker deletes only the three authentication artefact classes listed above. A new
destructive record class requires an approved ADR/policy update, migration-safe implementation,
restore testing, and proof that invariant 14 is preserved.
