CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

##### **CBT PLATFORM**

# **Technical Architecture Specification**

_Production architecture baseline for a multi-school secondary-school Computer-Based Testing platform._

Status: Architecture Baseline Scope: First production release Perspective: Technology-agnostic system design

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

## **1. Purpose and Architecture Goals**

This document translates the approved product, permission model, lifecycle, functional requirements, and canonical ERD into a production-oriented technical architecture. It intentionally avoids prematurely selecting a framework or cloud vendor. Technology choices should be made against these requirements.

- Multi-school tenant isolation with strong data boundaries.

- High-integrity examination execution and result calculation.

- Reliable CBT operation under unstable connectivity and power conditions common to physical school labs.

- Concurrent student attempts without data corruption or timer inconsistencies.

- Clear domain boundaries that support modular development and later extraction of services if scale justifies it.

- Complete auditability of high-impact academic and administrative actions.

- Safe subscription lifecycle without destroying school data.

- Operational observability, backup, recovery, and controlled deployments from the first production release.

## **2. Architecture Style**

Recommended baseline: a modular monolith with strong domain boundaries, backed by asynchronous workers and independently scalable supporting infrastructure. The application should behave as one coherent product while its internal modules remain isolated by responsibility.

###### Clients

|

v

Web / Student CBT Client

|

v

Application/API Layer

|

- +-- Identity & Access

- +-- Schools & Subscriptions

- +-- Academic Structure

- +-- Question Bank & Review

- +-- Exam Management

- +-- Exam Execution

- +-- Results & Analytics

- +-- Reports

- +-- Notifications

- +-- Audit

|

- +---- Relational Database

+---- Cache / Coordination Store

- +---- Object Storage

- +---- Background Job / Event Processing

- +---- Observability Stack

A modular monolith is preferred initially because the product has strong transactional relationships between exams, attempts, answers, and results. Splitting these into networked microservices too early would add distributedtransaction complexity before the business scale demands it.

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

## **3. Core Architectural Principles**

| **Principle**               | **Architectural implication**                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Domain ownership            | Each module owns its business rules and data access<br>patterns. Cross-module changes occur through explicit<br>application boundaries. |
| Tenant isolation            | School identity is part of every school-scoped authorization<br>decision and everyschool-owned datapath.                                |
| Server-authoritative truth  | The server is authoritative for permissions, exam state,<br>attempt state,deadlines,scoring,andpublication.                             |
| Ofline-resilient execution  | The student client may temporarily operate without<br>connectivity,but cannot mint authorityor extend an attempt.<br>                   |
| Immutable academic evidence | Submitted answers, attempt snapshots, fnalized results,<br>review decisions,and audit events arepreserved.                              |
| Idempotent operations       | Submission, answer sync, imports, result generation, and<br>administrative commands must tolerate retries.                              |
| Least privilege             | Users receive only the permissions and scope required for<br>their role and assignment.                                                 |
| Observability by default    | Important operations emit logs, metrics, traces, and audit<br>events where appropriate.                                                 |

## **4. Logical System Components**

| **Component**             | **Responsibility**                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Identity & Access         | Authentication, sessions, password/credential lifecycle, role<br>and scope authorization.                   |
| School & Subscription     | Tenant lifecycle, school onboarding, branding, subscription<br>state and activationgrants.                  |
| Academic Structure        | Sessions, terms, departments, classes, subjects, student<br>enrollment and teacher/HOD assignments.         |
| Question Bank             | Question revisions, options, media, imports, status lifecycle<br>and academic review.<br>                   |
| Exam Management           | Exam builder, question binding, confguration, readiness<br>checks and lifecycle.                            |
| Exam Execution            | Exam activation, sessions, participants, attempts, timers,<br>snapshots,answerpersistence and recovery.<br> |
| Results                   | Automatic marking, result fnalization, publication,<br>adjustments and result visibility.                   |
| Analytics & Reporting<br> | Derived performance metrics, exports and operational<br>summaries.                                          |
| Notifcations              | Operational messages and action reminders.                                                                  |
| Audit                     | Immutable record of security- and integrity-sensitive actions.<br>                                          |
| Background Processing     | Imports, marking, exports, notifcations, report generation and<br>non-interactive workloads.                |

## **5. Domain / Module Boundaries**

The application should be organized around the previously approved bounded domains. The following modules are distinct even if they initially live in one deployable application.

- Platform: Software Admin, schools, subscriptions, activation grants.

- Identity: Users, school memberships, roles, sessions, credentials.

- Academics: Sessions, terms, departments, classes, subjects, enrollments, assignments.

- Questions: Questions, revisions, options, media, review workflow and import pipeline.

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

- Exams: Exams, sections, exam-question bindings, readiness and configuration.

- Execution: Exam sessions, participants, attempts, snapshots, answers and participation.

- Results: Question-level marking, result calculation, publication and adjustments.

- Analytics: Derived metrics and report views; should not own authoritative academic facts.

- Operations: Audit, notifications, health and background jobs.

## **6. Deployment Topology (Logical)**

Internet / School Networks

| DNS / Edge | Load Balancer / Gateway | +-------+--------+ | | Web/API Nodes Worker Nodes | | +-------+--------+ | Relational Database | +-------+---------+ | | | Cache Object Job/Event Storage Infrastructure | Monitoring / Logs / Tracing

The edge/gateway should terminate secure client connections, apply basic rate limiting and route traffic to stateless application instances. Application instances should not hold essential exam state only in process memory.

## **7. Data Architecture**

The relational database remains the authoritative system of record for transactional school, academic, assessment, attempt, and result data. Object storage holds files and media. The cache/coordination layer is an accelerator and coordination mechanism, never the authoritative source for academic records.

#### **7.1 Primary relational domains**

- School & Subscription

- Identity & Access

- Academic Structure

- Question Bank

- Exam & Exam Session

- Attempt & Answer

- Results

- Audit

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

#### **7.2 Database rules**

- Every school-owned record must be directly or transitively tied to a school.

- Foreign keys and application-level authorization must both enforce tenant boundaries.

- Critical academic records must use immutable or append-only patterns after finalization.

- Indexes must support school_id plus the most common scope filters: session, class, subject, status and time.

- Transactions must cover multi-record state changes where partial completion would create academic inconsistency.

#### **7.3 Transaction boundaries**

- Create/submit question revision + review state change.

- Finalize exam readiness.

- Open/close exam session.

- Create attempt + lock its initial execution context.

- Finalize submission + prevent further answer mutation.

- Generate question-level results + final result.

- Apply result adjustment + write audit event.

- Promote students at session rollover.

## **8. Multi-Tenancy Strategy**

The school is the primary tenant. The first architecture should use a shared application and shared relational database with strict tenant scoping and database constraints. A future migration path to stronger isolation must remain possible.

- All school-scoped queries require school context.

- Background workers process jobs with explicit school scope.

- Exports are generated only from authorized school context.

- Cache keys include school identity where data is school-specific.

- Object-storage paths include school namespace.

- Software Admin cross-school operations are explicit and audited.

## **9. API Boundary Design**

The external API should be resource-oriented but domain-aware. API modules should map to business capabilities rather than database tables.

| **API area**  | **Representative responsibilities**                                              |
| ------------- | -------------------------------------------------------------------------------- |
| Auth          | Login, logout, credential reset, session refresh, account<br>status.<br>         |
| Schools       | Schoolprofle,branding,onboarding,status.                                         |
| Subscriptions | Activation,status,renewal state.                                                 |
| Academics     | Sessions, terms, departments, classes, subjects,<br>enrollments,assignments.<br> |
| Questions     | CRUD for drafts,revision workfow,review,import,export.<br>                       |
| Exams         | Creation, question selection, confguration, readiness,<br>lifecycle.             |
| Execution     | Open/close session, authorization, attempt lifecycle, answer<br>sync,submission. |
| Results       | Result retrieval, publication,adjustments,exports.                               |
| Analytics     | Aggregated views and reports.                                                    |
| Audit         | Authorized audit retrieval.                                                      |

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

The student CBT API surface should be intentionally narrow. The student client should receive only the data required to execute its current attempt and view permitted results.

## **10. Authentication & Authorization**

Authorization is not a single role check. Every protected operation evaluates the effective school scope and, where applicable, academic assignment.

Effective Access =

Authenticated User

- Active School Membership

- Role Assignment

- Resource School

- Academic Scope

* - Resource Ownership / Assignment

* - Resource State

- Requested Action

* Software Admin: platform-wide authority, with sensitive school-content operations audited.

* School Admin: school-wide administrative authority.

* Moderator: school operational authority within assigned school.

* HOD: department-scoped academic governance.

* Teacher: assignment-scoped assessment authority.

* Student: own-assessment and permitted-result access only.

## **11. Student CBT Execution Architecture**

The CBT execution path is the highest-integrity runtime path. It must be designed around temporary connectivity loss, concurrent starts, retry-safe writes and server-authoritative timing.

#### **11.1 Start flow**

1. Student requests current assessment.

2. Server verifies school, session, class, eligibility and exam availability.

3. Server verifies attempt policy.

4. Server creates attempt transactionally.

5. Server establishes start time and expiry.

6. Server generates/stores presentation snapshot.

7. Client receives the attempt package.

8. Client begins local display timer from server-authoritative expiry.

#### **11.2 Answer flow**

Answers should be saved frequently and safely. The client may temporarily queue changes locally when connectivity is unavailable. On reconnection it synchronizes pending changes using idempotent operation identifiers and the server validates that the attempt is still writable.

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

#### **11.3 Submission flow**

Client -> Submit Attempt Server -> Verify attempt state and deadline Server -> Freeze answer state Server -> Mark attempt submitted/auto-submitted Server -> Queue/perform marking Server -> Finalize result Server -> Return final status

Submission must be idempotent. Repeating the same submission request should not generate duplicate results or duplicate attempts.

#### **11.4 Timer authority**

- The authoritative timer is derived from server-recorded start and expiry values.

- The client displays the timer but does not define the authoritative deadline.

- Clock manipulation on the device must not extend an attempt.

- Network loss must not reset the timer.

- When the server receives an answer after expiry, the server applies the defined cutoff policy rather than trusting client time.

## **12. Offline / Resilience Strategy**

Offline support should be bounded and intentional: preserve active assessment progress through temporary outages without allowing the client to create new authority.

#### **12.1 What may work locally**

- Read already-authorized question snapshots.

- Record answer changes.

- Maintain a local queue of unsynchronized answer operations.

- Display locally derived timer information.

- Show connection state.

#### **12.2 What requires server authority**

- Starting an attempt.

- Granting a new attempt.

- Changing attempt duration.

- Changing exam eligibility.

- Submitting an attempt as final.

- Publishing results.

- Invalidating an attempt.

#### **12.3 Reconnection**

Pending local operations

|

v

Synchronize -> Server validation

|

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

| | accepted rejected | | commit resolve / retry | v

client state reconciled

The reconciliation process must be deterministic. A client must never assume that a queued operation succeeded merely because it was sent.

## **13. Caching Strategy**

Caching should improve responsiveness but never become the authoritative source for exam integrity.

- Read-heavy school configuration can be cached with explicit invalidation.

- Question-bank browsing can use short-lived or request-level caching.

- Student exam snapshots may be locally cached for the current attempt.

- High-frequency operational counters can use fast temporary aggregates, while authoritative records remain in the database.

- Cache keys must include tenant and relevant academic/exam scope.

- Sensitive data must not leak between users through shared cache entries.

## **14. Background Jobs & Asynchronous Processing**

Background processing should handle work that is expensive, retryable or not necessary for the immediate interactive response.

- Bulk student/teacher imports.

- Question imports and validation summaries.

- Report and CSV generation for large datasets.

- Large-scale result exports.

- Notifications.

- Analytics aggregation where useful.

- Result recalculation after controlled adjustments.

- Cleanup/retention jobs.

- Subscription reminders.

Attempt finalization must remain safe if a background worker crashes. The attempt should already be in a durable, unambiguous state before a worker handles downstream processing.

## **15. Storage Architecture**

| **Data type**                      | **Recommended logical storage**                          |
| ---------------------------------- | -------------------------------------------------------- |
| Transactional school/academic data | Relational database                                      |
| Question images/diagrams           | Object storage                                           |
| School logos                       | Object storage                                           |
| Large exports                      | Object storage with controlled access                    |
| Temporarycache/state acceleration  | Cache/coordination store                                 |
| Application logs                   | Centralized log platform                                 |
| Audit records                      | Authoritative relational storage,withprotected retention |

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

File references should be stored in business records; binary files should not be embedded into transactional rows unless there is a deliberate reason.

## **16. Security Architecture**

- Use secure password hashing and credential lifecycle management.

- Use secure, revocable sessions/tokens and protect sensitive session state.

- Enforce authorization on the server for every school-scoped operation.

- Never trust client-provided school_id, role, class, subject or score as authoritative.

- Validate all uploaded files and isolate stored media.

- Apply rate limiting to authentication and sensitive endpoints.

- Protect administrative operations with stronger controls and audit trails.

- Encrypt sensitive traffic in transit and protect secrets at rest.

- Apply least privilege to service accounts and infrastructure components.

- Keep audit events tamper-resistant and separate from ordinary user-editable records.

## **17. Exam Security / Integrity**

- Question order randomization is determined per attempt when enabled.

- Option order randomization is determined per attempt when enabled.

- Attempt duration is server-authoritative.

- Completed attempts cannot be reopened normally.

- Question snapshots preserve exactly what the student received.

- Administrative invalidation requires explicit permission and reason.

- Potential anti-cheating signals are recorded as events and should not automatically be treated as proof of misconduct.

- Score changes require controlled result-adjustment workflows.

## **18. Observability**

| **Area** | **Examples**                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metrics  | Request latency, error rates, database health, queue depth,<br>active attempts, answer-save failures, submission rate,<br>markinglatency,exam-session activity.<br> |
| Logs     | Structured application logs with correlation identifers and<br>tenant context where safe.<br>                                                                       |
| Tracing  | Trace important end-to-end fows such as start attempt,<br>answer sync,submit and resultgeneration.                                                                  |
| Audit    | Human-facing record of sensitive academic and<br>administrative changes.                                                                                            |
| Alerts   | Database saturation, error spikes, queue backlog, answer<br>persistence failures, abnormal submission latency,<br>infrastructure health.                            |

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

## **19. Performance & Scalability Model**

The system should scale primarily by separating read-heavy administrative workloads from the high-frequency write path of exam execution.

- Application nodes should be stateless enough to scale horizontally.

- The relational database remains the authoritative transaction engine.

- Indexes and query design must prioritize attempt, answer and result access patterns.

- Background workers absorb heavy imports, reports and post-exam processing.

- Caching reduces repeated reads for school configuration and static/reference data.

- Object storage handles large files so transactional infrastructure does not carry binary payloads unnecessarily.

## **20. Exam Load Model**

Capacity planning should not assume only the number of simultaneous students. The important metric is concurrent active attempts plus the write frequency created by answer persistence.

Concurrent active attempts x Answer-save frequency x Average payload size = exam write pressure

Separate capacity tests should model: 20 students, 100 students, 500 students, 1,000 students and higher schoolwide bursts. The architecture should make horizontal application scaling possible without redesigning the business model.

## **21. Backup & Disaster Recovery**

- Automated database backups with point-in-time recovery capability where supported by the chosen database service.

- Redundant object storage or versioning for school logos, question media and reports.

- Recovery procedures documented and tested rather than assuming backups are sufficient.

- Periodic restore drills using non-production environments.

- Clear RPO/RTO targets defined before production launch.

- Exam data recovery has priority because attempts and results are high-integrity records.

| **Target**       | **Baseline to defne before launch**                                                 |
| ---------------- | ----------------------------------------------------------------------------------- |
| RPO              | Maximum acceptable data loss window for transactional<br>records.                   |
| RTO              | Maximum acceptable service restoration time after a major<br>failure.               |
| Backup retention | Short-term daily/point-in-time plus longer-term policy for<br>academic records.<br> |
| Restore test     | Scheduled verifcation that backups can actually restore a<br>usable system.         |

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

## **22. Environments**

| **Environment**   | **Purpose**                                                                  | **Datapolicy**                                       |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Local/Development | Feature development and<br>unit/integration testing                          | Synthetic or anonymized data only                    |
| Test/QA           | Automated tests, integration, security,<br>migration and workfow verifcation | Synthetic fxtures                                    |
| Staging           | Production-like pre-release validation<br>and load tests                     | Non-production data, production-like<br>confguration |
| Production        | Real schools and examinations                                                | Live data with strict access controls                |

Production migrations must be backward-aware so that application rollout does not create a window where old and new versions corrupt each other.

## **23. CI/CD & Release Principles**

- Every change passes automated tests before merge.

- Database migrations are versioned and reviewable.

- Releases are deployable independently of manual database editing.

- Feature flags may be used for risky functionality.

- Exam-related changes require stronger regression coverage than ordinary UI changes.

- Rollback strategy must exist for application releases, with special care around irreversible data migrations.

## **24. Testing Strategy**

- Unit tests for business rules and state transitions.

- Integration tests for database transactions and authorization boundaries.

- API contract tests for client/server interactions.

- End-to-end tests for the complete exam lifecycle.

- Concurrency tests for simultaneous student starts and submissions.

- Reconnection/offline tests for answer synchronization.

- Load tests for large exam sessions.

- Security tests for tenant isolation and privilege escalation.

- Data-integrity tests for result calculation and historical snapshots.

- Disaster-recovery drills for restoration and continuity.

## **25. Failure Handling Principles**

| **Failure**                | **Expected system behaviour**                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Temporarynetwork loss      | Preserve localprogress;reconcile after reconnect.                                                 |
| Database transient failure | Retrysafe operations;never duplicate attempts/results.                                            |
| Worker crash               | Job becomes retryable;source records remain durable.                                              |
| Client crash               | Student can return to the existing active attempt if policy<br>permits and time remains.          |
| Application node crash     | Another stateless node serves the next request.                                                   |
| Cache outage               | Application falls back to authoritative storage wherepractical.<br>                               |
| Object storage outage      | Do not silently mark fle-dependent content as permanently<br>successful; preserve retrystate.<br> |
| Result worker failure      | Attempt remains fnalized;markingcan resume idempotently.                                          |

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

## **26. Architecture Decision Record Topics**

Before implementation, the engineering team should explicitly record decisions for the following technology-level questions:

- Frontend/client framework and student CBT rendering model.

- Backend framework and internal module structure.

- Relational database engine and hosting model.

- Cache/coordination technology.

- Job queue/event processing technology.

- Object storage provider and CDN strategy.

- Authentication/session technology.

- Observability/error tracking stack.

- Cloud/infrastructure provider.

- Single-region versus multi-region deployment.

- Offline storage mechanism and synchronization protocol.

Those decisions should be evaluated against this architecture rather than used to redefine it.

## **27. Recommended Initial Runtime Topology**

For the first production release, keep the operational topology intentionally simple while preserving scale paths:

1. Web application / API tier

2. Relational database

3. Cache / coordination store

4. Background worker tier

5. Object storage + CDN/edge delivery where useful

6. Central logs / metrics / error tracking

7. Backup + recovery infrastructure

Do not split the product into many independently deployed microservices until observed scale, team boundaries, or failure isolation requirements justify the additional complexity.

## **28. Architecture Readiness Checklist**

- Product roles and permissions are defined.

- School lifecycle is defined.

- Module and screen hierarchy is defined.

- Functional requirements are defined.

- Canonical ERD and state transitions are defined.

- Exam attempt transaction is defined.

- Multi-tenant boundary is defined.

- Offline/resilience requirements are defined.

- Audit and historical integrity rules are defined.

- Scalability concerns are identified.

- Backup and recovery requirements are identified.

- Next step: evaluate concrete technology choices against this baseline.

Production CBT Platform | Architecture baseline

CBT PLATFORM — TECHNICAL ARCHITECTURE SPECIFICATION

## **29. Final Architecture Principle**

### **The architecture must make the correct product behaviour easy and the incorrect behaviour difficult.**

The most important example is examination integrity: the system should make it straightforward to start a valid attempt, persist answers, survive interruptions, submit exactly once, calculate the correct result, and preserve the historical evidence. It should be structurally difficult for a client, administrator, network failure, or later content edit to corrupt that chain.

Production CBT Platform | Architecture baseline
