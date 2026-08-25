Yes. Now we can have the technology discussion properly.

I've reviewed the architecture baseline again, especially the parts around the **exam execution path, tenant isolation, transactional integrity, offline operation, background processing, and recovery**. The architecture strongly points toward a particular family of technologies.

My recommendation is:

> **TypeScript end-to-end, modular NestJS backend, Next.js web client, PostgreSQL, Redis-compatible infrastructure, BullMQ, S3-compatible object storage, and managed cloud infrastructure.**

But there are a few places where I think we should deliberately debate the options before calling them final.

---

# 1. My proposed production stack

| Layer                | Recommendation                                      |
| -------------------- | --------------------------------------------------- |
| Language             | **TypeScript**                                      |
| Runtime              | **Node.js 24 LTS**                                  |
| Backend              | **NestJS 11** + Fastify                             |
| Frontend             | **Next.js 16.3** + React                            |
| Student CBT          | Next.js PWA + client-side exam engine               |
| Server state         | TanStack Query                                      |
| Active exam state    | IndexedDB + Dexie + local state machine             |
| Database             | **PostgreSQL 18**                                   |
| ORM                  | **Prisma 8**                                        |
| Cache / coordination | **Redis-compatible store**                          |
| Job queue            | **BullMQ**                                          |
| Realtime             | **SSE initially**, WebSocket only where justified   |
| Object storage       | **Amazon S3**                                       |
| CDN / edge           | CloudFront / Cloudflare depending deployment        |
| API                  | REST + OpenAPI                                      |
| Authentication       | Custom server-controlled auth                       |
| Password hashing     | Argon2id                                            |
| Observability        | OpenTelemetry + Sentry                              |
| Backend hosting      | AWS ECS/Fargate                                     |
| Database hosting     | AWS RDS PostgreSQL                                  |
| Redis hosting        | AWS ElastiCache/managed Redis-compatible service    |
| CI/CD                | GitHub Actions                                      |
| Repository           | Monorepo                                            |
| Local development    | Docker Compose                                      |
| Testing              | Unit + integration + E2E + concurrency/load testing |

This is not just because these are technologies I like. They map unusually well to what we've designed.

---

# 2. Why TypeScript end-to-end?

I think this is the first decision I'd make.

You could absolutely build the backend in:

- Python/FastAPI
- Go
- Java/Kotlin
- .NET

But given this particular product, **TypeScript across the application is my preferred choice.**

Why?

We have:

```text
Next.js
     ↕
TypeScript contracts
     ↕
NestJS
     ↕
PostgreSQL
```

The frontend and backend share:

- DTO shapes
- enums
- state definitions
- API contracts
- validation schemas
- error types
- exam state definitions

This is especially valuable for the CBT client because the client and server are effectively participating in the same state machine.

Node 24 is currently an LTS release, and NestJS 11 remains the current major line; Nest's official documentation also provides first-class support for modular architecture, guards, queues, Fastify, WebSockets and SSE. ([Node.js][1])

---

# 3. Backend: NestJS 11 + Fastify

This one is, to me, a very strong fit.

Our backend naturally breaks into:

```text id="22xq5s"
IdentityModule
SchoolsModule
SubscriptionsModule
AcademicsModule
UsersModule
AssignmentsModule
QuestionsModule
QuestionReviewModule
ExamsModule
ExamExecutionModule
ResultsModule
AnalyticsModule
ReportsModule
NotificationsModule
AuditModule
```

That is almost exactly how Nest's module system is intended to be used: modules encapsulate related providers and expose only the interfaces other modules need. ([NestJS Documentation][2])

And Nest's guards map nicely to our authorization model:

```text
Authenticated User
        +
School Membership
        +
Role
        +
Academic Scope
        +
Resource State
        +
Action
```

Nest explicitly supports guards for runtime authorization such as roles and ACL-style decisions. ([NestJS Documentation][2])

### Why Fastify?

I'd use:

**NestJS + `@nestjs/platform-fastify`**

rather than the default Express adapter.

Nest officially supports Fastify and documents it as the higher-performance alternative when performance matters. ([NestJS Documentation][3])

Our exam system produces a potentially high volume of relatively small API calls:

```text
start attempt
load question
save answer
save answer
save answer
...
submit
```

Fastify is a sensible optimization without sacrificing Nest's architecture.

---

# 4. Alternative: FastAPI

This is the strongest alternative I'd consider because Python is excellent for backend development.

A FastAPI system could be:

```text
Next.js
   ↓
FastAPI
   ↓
SQLAlchemy
   ↓
PostgreSQL
```

and it would absolutely work.

But I don't think we gain enough to justify introducing a second primary language.

The product isn't AI-heavy yet.

We don't currently need Python for:

- examination execution
- CRUD
- transactions
- authorization
- realtime monitoring
- imports
- reporting

And if AI features eventually arrive, we can call Python/AI services separately.

So my decision:

> **Don't use Python for the core backend merely because we can.**

Keep the core product TypeScript.

---

# 5. Frontend: Next.js 16.3

This is another strong yes.

Next.js 16.3 is currently available, and Next.js 16 is actively receiving security/maintenance releases. ([Next.js][4])

I'd use the App Router.

But there's an important architectural distinction:

### Administrative UI

Uses Next.js normally.

### CBT engine

Uses Next.js primarily as the shell/framework, but the actual exam experience becomes **heavily client-side**.

We don't want:

```text
Question
 ↓
server request
 ↓
render
 ↓
next question
 ↓
server request
```

during an exam.

Instead:

```text
START ATTEMPT
      ↓
Receive authorized exam package
      ↓
Store locally
      ↓
Run exam locally
      ↓
Synchronize answers
```

That distinction is extremely important.

Next.js itself can be deployed outside Vercel; the framework now has a stable Adapter API for different deployment targets. ([Next.js][5])

---

# 6. One Next.js application or separate applications?

I'd initially do:

```text id="f3cg0y"
apps/
├── web
│   ├── admin
│   ├── moderator
│   ├── hod
│   ├── teacher
│   └── student
│
├── api
│
└── worker
```

So **one web application**, not five separate frontend applications.

Routes:

```text id="a9fhiy"
/
├── login
├── admin/
├── moderator/
├── hod/
├── teacher/
└── student/
    └── exam/
```

The Student CBT interface can have its own isolated client-side runtime within the same application.

Later, if traffic or deployment requirements justify it, the CBT client can become an independently deployed application without changing the backend domain model.

---

# 7. PWA: Yes, but carefully

I definitely want the student side to be installable as a PWA.

The browser should be able to retain:

- Application shell
- Exam UI assets
- Current exam package
- Current answers
- Synchronization queue

Service workers are specifically designed to provide offline access and improve reliability, and Workbox provides production tooling for caching and background synchronization. ([Chrome for Developers][6])

However:

> **The PWA is not the authority.**

The browser doesn't get to decide:

> "I have another 20 minutes."

The server remains authoritative.

---

# 8. The CBT local state architecture

I'd use:

### IndexedDB

for durable browser-side exam state.

And:

### Dexie

as the IndexedDB abstraction.

Conceptually:

```text id="58p97v"
IndexedDB
│
├── active_attempt
├── question_snapshots
├── answers
├── pending_sync_operations
├── exam_metadata
└── sync_state
```

The student can therefore survive:

- Network loss
- Page refresh
- Temporary browser disruption
- Lab Wi-Fi instability

without treating the browser as authoritative.

---

# 9. TanStack Query — but NOT for the exam itself

This is an important distinction.

I'd use TanStack Query for:

- Teacher dashboard
- Student results
- HOD review queue
- School metrics
- User lists
- Question bank
- Exam lists

But **not as the authoritative state machine for an active examination**.

During an exam:

```text
IndexedDB
+
local exam state
+
server synchronization
```

should be the architecture.

TanStack Query can still retrieve the initial attempt package, but shouldn't own the complete exam state.

---

# 10. Workbox for resilience

I'd use Workbox or an equivalent mature service-worker layer for:

- Application shell
- Static assets
- Fonts/icons
- Exam UI assets
- Controlled runtime caching
- Retry queues

Workbox specifically supports background synchronization for requests that failed while offline. ([Chrome for Developers][7])

But again:

> Background Sync is a helpful mechanism, not our sole synchronization strategy.

The application itself must maintain a durable answer queue.

That way, if a browser doesn't perform Background Sync exactly when expected, our exam state isn't dependent on it.

---

# 11. Database: PostgreSQL 18

This one is almost non-negotiable.

We're building a transactional examination system.

PostgreSQL gives us:

- ACID transactions
- Foreign keys
- Constraints
- Row-level locking
- Strong consistency
- Mature indexing
- JSON capabilities where useful
- Excellent reporting/query support

And PostgreSQL 18 is currently supported; the current minor release is 18.6 as of August 13, 2026. PostgreSQL major versions are supported for five years. ([PostgreSQL][8])

Our data model is relational by nature.

MongoDB would be the wrong default here.

---

# 12. Why not MongoDB?

Consider our core operation:

```text
Exam
 ↓
Exam Session
 ↓
Participant
 ↓
Attempt
 ↓
Question Snapshot
 ↓
Answer
 ↓
Question Result
 ↓
Result
```

And the constraints:

```text
one attempt
one timer
one result
one publication state
one academic scope
```

This is relational data with transactional boundaries.

PostgreSQL is a much more natural fit.

---

# 13. ORM: Prisma vs Drizzle

This is one place where I think we should actually discuss.

## Option A — Prisma

**My recommendation: Prisma 8.**

Advantages:

- Strong type safety
- Excellent TypeScript experience
- Schema-driven development
- Migrations
- Nested writes
- Transactions
- PostgreSQL support
- Mature ecosystem
- Good NestJS compatibility

Prisma currently supports PostgreSQL 18 and provides interactive transactions with configurable isolation levels. ([Prisma][9])

### Potential concern

Our exam engine will sometimes need very deliberate SQL operations.

For example:

```sql
SELECT ...
FOR UPDATE
```

or specialized reporting queries.

I am completely comfortable using raw SQL/SQL-builder access where necessary.

We should **not** force every query through ORM abstractions.

---

# 14. Option B — Drizzle

Drizzle is a very attractive alternative for this system because it stays close to SQL.

It supports PostgreSQL and explicit transactions, including configurable isolation levels. ([Drizzle ORM][10])

I particularly like it for:

- Complex reporting
- Explicit SQL
- Database-heavy services
- Developers who think in SQL

But for this particular project, I slightly prefer Prisma because the domain model is large and the team will benefit from its more opinionated schema/client experience.

### My ranking

```text
Prisma      9/10
Drizzle     8.5/10
TypeORM     7/10
```

I would **not use TypeORM** for this project unless the team had a strong existing reason.

---

# 15. Redis

Redis fits our architecture very well.

But I want to be extremely clear:

> **Redis will never be the source of truth for exam answers, attempts, scores, or results.**

Redis is for:

- Cache
- Rate limiting
- Temporary coordination
- Distributed locks where appropriate
- Realtime fan-out
- Queue infrastructure
- Short-lived counters

Redis supports the relevant data structures and can also provide persistence, but its persistence characteristics are not what we want to rely on for academic records. ([Redis][11])

The database remains authoritative.

---

# 16. BullMQ

I'd choose **BullMQ** over Bull.

Nest currently provides a first-party `@nestjs/bullmq` integration, and its documentation explicitly notes that Bull is in maintenance mode while BullMQ is actively developed. ([NestJS Documentation][12])

This matches our job requirements:

```text
Bulk Imports
Report Generation
Question Import
CSV Export
Notifications
Analytics
Result Recalculation
Subscription Reminders
Cleanup
```

BullMQ also supports retries and job deduplication, which is useful for operations where repeated requests must not result in duplicated work. ([BullMQ][13])

---

# 17. Important: Don't put answer saving through BullMQ

This is something I'd explicitly prohibit.

Bad:

```text
Student
 ↓
Queue answer
 ↓
Worker
 ↓
Database
```

There is unnecessary uncertainty there.

Instead:

```text
Student
 ↓
API
 ↓
PostgreSQL transaction
 ↓
ACK
```

The answer must be durably persisted as part of the interactive path.

The queue is for downstream work.

---

# 18. Exam submission architecture

Similarly:

```text
Student
 ↓
POST /attempts/:id/submit
 ↓
BEGIN TRANSACTION
 ↓
Verify attempt
 ↓
Verify deadline
 ↓
Freeze answers
 ↓
Mark submitted
 ↓
COMMIT
 ↓
Queue result processing
 ↓
Worker calculates result
```

This is a much safer design.

The critical state transition happens synchronously.

The expensive downstream processing can be asynchronous.

---

# 19. API Style: REST

I'd use:

**REST + OpenAPI**

rather than GraphQL.

Why?

Our API is naturally action/resource oriented:

```text
POST /attempts
POST /attempts/:id/answers
POST /attempts/:id/submit

POST /exams/:id/open
POST /exam-sessions/:id/close
POST /makeups

GET /questions
GET /exams
GET /results
```

It is straightforward for a PWA and easy to audit.

GraphQL adds flexibility we don't particularly need.

---

# 20. API versioning

Start with:

```text id="wq7h4x"
api.cbt-platform.com/v1/...
```

Do not expose database tables as APIs.

The API should expose **domain capabilities**.

Bad:

```text
POST /exam_attempts/create
```

Better:

```text
POST /exams/:examId/attempts
```

Better still where the business action matters:

```text
POST /attempts/:attemptId/submit
```

---

# 21. Realtime: SSE first

For the teacher's live Exam Control Center, I don't think we need WebSockets everywhere.

For:

> "Ahmed just submitted."

> "David started."

> "Mary has 18 minutes remaining."

we primarily need:

**server → browser**

So I'd start with **Server-Sent Events**.

Nest supports SSE directly. ([NestJS Documentation][14])

Architecture:

```text
Student action
     ↓
PostgreSQL
     ↓
Event
     ↓
Redis pub/sub
     ↓
SSE
     ↓
Teacher Control Center
```

WebSockets remain available if we later discover a genuine bidirectional requirement.

---

# 22. Storage: S3

For this product, I'd choose **Amazon S3** as the default.

Store:

```text id="y7j1o3"
schools/{schoolId}/branding/...
schools/{schoolId}/questions/...
schools/{schoolId}/reports/...
```

Question media should live in a **private bucket**.

The API generates short-lived authorized access.

School logo could potentially be publicly cacheable, depending on the final branding implementation.

S3 Versioning is useful because it retains object versions and helps recover from accidental overwrites/deletions. ([AWS Documentation][15])

---

# 23. What about Cloudflare R2?

I actually like R2.

R2 is S3-compatible, so the application can use existing S3-compatible SDKs, and Cloudflare currently offers no egress fees for R2. ([Cloudflare Docs][16])

However, R2 is not a perfect one-to-one S3 replacement; Cloudflare maintains an explicit S3 API compatibility matrix with some unsupported or experimental operations. ([Cloudflare Docs][17])

So my decision would be:

### Default

**AWS S3**

### Alternative

**Cloudflare R2**

especially if our object-storage egress becomes significant.

The application should abstract object storage behind:

```text
ObjectStorageService
```

so switching later doesn't contaminate the domain code.

---

# 24. Authentication

I would **not use Supabase Auth as the core authentication layer** for this product.

Not because Supabase Auth is bad.

Because our authentication requirements are unusually school-specific.

We have:

```text
Student ID / username
Teacher account
HOD account
Moderator
School Admin
Software Admin
```

with role and academic scope.

I'd implement authentication within NestJS.

### Credentials

- Username/identifier
- Password
- Argon2id hashing
- Password reset
- Account status
- Session management

### Browser authentication

Secure:

- HttpOnly
- Secure
- SameSite-appropriate
- Rotatable

sessions/tokens.

And server-side authorization remains mandatory.

---

# 25. Don't put roles inside an untrusted JWT and call it done

A JWT might contain:

```json
{
  "role": "teacher",
  "schoolId": "..."
}
```

but the server should not blindly trust this for authorization forever.

Why?

Teacher assignment can change.

HOD assignment can change.

Student class can change.

Account can be suspended.

Therefore:

> **Authentication token = identity/session evidence.**

> **Authorization = current database-backed reality.**

This matches our architecture's:

```text
User
+
Membership
+
Role
+
Assignment
+
Resource
+
State
```

model.

---

# 26. Monorepo

I'd use a monorepo.

Something like:

```text id="f9h7g1"
cbt-platform/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── contracts/
│   ├── validation/
│   ├── ui/
│   ├── config/
│   ├── auth/
│   └── domain/
│
├── infra/
├── docs/
└── tests/
```

This becomes particularly valuable because:

```text
web
  ↕
shared contracts
  ↕
api
```

can share strongly typed interfaces.

---

# 27. Package manager

I'd use:

**pnpm**

and probably **Turborepo** for orchestration/caching.

This isn't essential to the architecture, but it gives us a clean development structure.

---

# 28. Vercel vs AWS for Next.js

Here I would actually choose:

### Next.js

**Vercel**

### API/Workers

**AWS**

rather than forcing everything onto AWS.

Vercel is the native deployment environment for Next.js and provides zero-config deployment and Next.js-specific optimizations. ([Vercel][18])

The architecture is therefore:

```text
                    USERS
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
     Vercel                      AWS
   Next.js Web             NestJS API/Workers
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                   RDS         Redis           S3
               PostgreSQL
```

---

# 29. Why not host everything on Vercel?

Because the API/workers have requirements that aren't naturally serverless:

- Long-running worker processes
- BullMQ consumers
- Persistent connection pools
- Realtime streams
- Controlled concurrency
- Background processing
- Fine-grained network access
- Predictable infrastructure

The API should be a normal long-running service.

---

# 30. Why not host everything on Render?

Render could absolutely run this.

And it would be very convenient.

But for the **production-grade version** we are describing, I'd rather have:

```text
VPC
Load Balancer
Application Tasks
Managed PostgreSQL
Managed Redis
Private storage
IAM
Backups
Monitoring
```

with more explicit control.

This is especially important because our most important workload is the examination engine.

This isn't a criticism that Render is incapable; it's about how much infrastructure control we want around a high-integrity system.

---

# 31. AWS Compute

I'd use:

**ECS + Fargate**

initially.

Conceptually:

```text id="y3c7bq"
ECS Cluster
│
├── API Service
│    ├── Task
│    ├── Task
│    └── Task
│
└── Worker Service
     ├── Worker
     └── Worker
```

This gives us horizontal scaling without introducing Kubernetes.

### Important:

**No Kubernetes initially.**

We have no reason to accept Kubernetes operational complexity on day one.

---

# 32. Database infrastructure

I'd use:

**Amazon RDS PostgreSQL**

Production:

```text id="k9f0t3"
RDS PostgreSQL
+
Automated Backups
+
PITR
+
Multi-AZ
```

RDS supports automated backups and point-in-time recovery within the configured retention window. ([AWS Documentation][19])

AWS also supports Multi-AZ PostgreSQL deployments for high availability; Multi-AZ DB clusters provide a writer and two readers across three Availability Zones where appropriate. ([AWS Documentation][20])

I wouldn't necessarily start with the most expensive Multi-AZ cluster. We should benchmark and choose the appropriate HA configuration.

But **production must not be a single manually managed Postgres VM.**

---

# 33. Redis infrastructure

For production:

**Managed Redis-compatible service.**

If the AWS architecture is chosen, evaluate:

- ElastiCache/Valkey
- Redis Cloud

The choice depends on pricing, operational features, and BullMQ compatibility at the versions we deploy.

The important thing is:

> Redis failure should degrade caching/realtime conveniences without corrupting the examination database.

---

# 34. CDN

For:

- School logos
- Static assets
- Public UI assets

we can use the frontend's CDN.

For private exam media, access must remain authorized.

We should never simply put:

```text
/question-images/exam-question-17.jpg
```

on a public URL during a live examination.

---

# 35. Observability

I'd use:

**OpenTelemetry + Sentry**

OpenTelemetry gives us vendor-neutral telemetry for traces, metrics and logs. ([OpenTelemetry][21])

Sentry becomes the developer-facing error/issue system.

The architecture becomes:

```text
Application
   │
   ├── Logs
   ├── Metrics
   └── Traces
          ↓
   OpenTelemetry
          ↓
   Observability backend
          +
        Sentry
```

---

# 36. The metrics I particularly care about

Not just CPU and RAM.

### Examination

```text
active_attempts
attempt_start_rate
answer_save_rate
answer_save_latency
submission_rate
submission_latency
auto_submission_count
answer_sync_failures
reconnection_rate
```

### Database

```text
connection_pool_usage
query_latency
locks
deadlocks
write throughput
replication/backup health
```

### API

```text
p50
p95
p99
error rate
5xx
4xx
```

### Queue

```text
waiting_jobs
active_jobs
failed_jobs
retry_rate
job_latency
```

Those are the metrics that tell us whether the CBT engine is healthy.

---

# 37. The most important alert

I'd create a dedicated:

> **Exam Health Monitor**

Suppose 500 students are currently taking exams.

Then suddenly:

```text
Answer Save Success
98.9% → 91.2% → 76%
```

That should trigger an operational alert.

We don't want to find out about an exam outage from a school administrator's WhatsApp message.

---

# 38. Testing Stack

This project needs stronger testing than a normal CRUD SaaS.

I'd establish:

### Unit

Business rules.

### Integration

PostgreSQL transactions.

### E2E

Full user workflows.

### Browser

Student CBT flows.

### Concurrency

100/500/1000 simultaneous attempts.

### Chaos/failure

Network disconnect.

### Security

Tenant isolation.

### Recovery

Database restoration.

---

# 39. The most important test

A complete automated test should literally simulate:

```text id="lqf1lv"
Create school
 ↓
Create session
 ↓
Create class
 ↓
Create subject
 ↓
Create teacher
 ↓
Assign teacher
 ↓
Create student
 ↓
Create question
 ↓
HOD approves
 ↓
Create exam
 ↓
Ready
 ↓
Open session
 ↓
Student starts
 ↓
Snapshot
 ↓
Answer questions
 ↓
Disconnect
 ↓
Reconnect
 ↓
Submit
 ↓
Mark
 ↓
Finalize result
 ↓
Publish
 ↓
Student views result
```

That is our **golden-path integration test**.

---

# 40. Load Testing

We should specifically test:

### Level 1

20 simultaneous students.

### Level 2

100.

### Level 3

500.

### Level 4

1,000.

### Level 5

Stress beyond expected production load.

But the important metric isn't simply:

> "Can the API handle 1,000 requests?"

We need:

```text
1000 concurrent attempts
×
answer save frequency
×
payload size
```

because answer persistence is our real write pressure.

---

# 41. Architecture During a 1,000-Student Exam

Something like:

```text id="aop6q5"
                    1,000 STUDENTS
                         │
                         ▼
                   Cloudflare / AWS
                      Load Balancer
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       API Node       API Node       API Node
          │              │              │
          └──────────────┼──────────────┘
                         │
                         ▼
                    PostgreSQL
                         │
                ┌────────┴────────┐
                ▼                 ▼
             Redis             Workers
                                  │
                                  ▼
                              Results
```

No API node holds the authoritative exam state.

That's what allows horizontal scaling.

---

# 42. What I Would NOT Use

For this project, I'd avoid:

### MongoDB as primary DB

Wrong shape for this domain.

### Microservices

Too early.

### Kubernetes

Too much operational burden initially.

### GraphQL

Not necessary.

### Supabase as the entire backend

Too much coupling to managed platform features for this particular architecture.

### Firebase

The data model and transactional requirements aren't a good fit.

### Serverless functions for the entire CBT engine

The exam engine benefits from predictable long-running application instances.

### Redis as primary database

Absolutely not.

### Public question media

Security problem.

### Browser-only timing

Integrity problem.

---

# 43. The architecture I would actually approve

Here's the concrete picture I'd sign off on:

```text id="o5y8vx"
                         INTERNET
                             │
                             ▼
                    ┌─────────────────┐
                    │ Cloudflare / CDN │
                    │ DNS / WAF / TLS │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
          ┌──────────┐             ┌─────────────┐
          │  Vercel  │             │ AWS ALB     │
          │ Next.js  │             │ API Gateway │
          └──────────┘             └──────┬──────┘
                                          │
                              ┌───────────┴───────────┐
                              │                       │
                              ▼                       ▼
                        NestJS API               NestJS Workers
                        Fastify                  BullMQ
                              │                       │
                    ┌─────────┼────────┐              │
                    ▼         ▼        ▼              ▼
                 PostgreSQL Redis      S3          Redis
                   RDS                 Storage
                    │
                    ▼
              Backups / PITR
```

---

# 44. One Modification I'd Make to the Earlier Architecture

There's one architectural refinement I would now make.

The previous architecture said:

> Web/API Nodes + Worker Nodes + Database + Cache + Object Storage + Job infrastructure.

I'd explicitly separate:

### Interactive path

```text
Student
 → API
 → PostgreSQL
```

from:

### Async path

```text
API
 → BullMQ
 → Worker
 → PostgreSQL / S3
```

and:

### Realtime path

```text
PostgreSQL/domain event
 → Redis pub/sub
 → SSE
 → Teacher dashboard
```

That gives us three clear operational lanes.

---

# 45. Interactive Path Must Be Tiny

This is particularly important.

For a student answer:

```text id="i8ofvo"
POST answer
 ↓
Auth
 ↓
Authorization
 ↓
Attempt validation
 ↓
Deadline validation
 ↓
Persist answer
 ↓
ACK
```

That's it.

Do not put:

- Analytics
- Notifications
- Report generation
- Student metrics
- Email
- Audit-heavy aggregation

in that synchronous path.

Those can happen asynchronously.

---

# 46. Submission Path

Likewise:

```text id="gudxpn"
Submit
 ↓
Validate
 ↓
Freeze
 ↓
Mark Submitted
 ↓
Commit
 ↓
ACK
 ↓
Queue marking
```

This dramatically reduces the chance of a school having a student click "Submit" and seeing a spinner for 20 seconds because some reporting query is running.

---

# 47. Database Transaction Strategy

We'll use PostgreSQL transactions heavily.

Examples:

### Start Attempt

```text id="c1mhpk"
BEGIN
 ↓
Validate eligibility
 ↓
Create attempt
 ↓
Create snapshot
 ↓
COMMIT
```

### Submit Attempt

```text id="j3ha8i"
BEGIN
 ↓
Lock attempt
 ↓
Verify state
 ↓
Verify expiry
 ↓
Freeze answer state
 ↓
Mark submitted
 ↓
COMMIT
```

### Result adjustment

```text id="fzwpn8"
BEGIN
 ↓
Validate permission
 ↓
Create adjustment
 ↓
Recalculate
 ↓
Update result
 ↓
Audit
 ↓
COMMIT
```

Exactly where locking/isolation is required will be specified during implementation.

---

# 48. Where I Think We Should Be Conservative

There are three places where I wouldn't rush implementation:

### 1. Exam synchronization

We should prototype this separately before the full system.

### 2. Concurrent attempt creation

We need load tests against PostgreSQL.

### 3. Timer/reconnection behaviour

We need to test:

```text
online
→ offline
→ refresh
→ reconnect
→ submit
```

under many variations.

These three determine whether this is truly production-grade CBT or merely a nice-looking exam application.

---

# 49. My Current Technology Decision Matrix

| Decision             | Recommendation          | Confidence |
| -------------------- | ----------------------- | ---------: |
| Backend language     | TypeScript              |  Very High |
| Backend              | NestJS 11               |  Very High |
| HTTP adapter         | Fastify                 |       High |
| Frontend             | Next.js 16.3            |  Very High |
| DB                   | PostgreSQL 18           |  Very High |
| ORM                  | Prisma 8                |       High |
| Cache                | Redis-compatible        |       High |
| Queue                | BullMQ                  |  Very High |
| API                  | REST/OpenAPI            |  Very High |
| Realtime             | SSE                     |       High |
| Exam offline storage | IndexedDB/Dexie         |  Very High |
| PWA layer            | Workbox/custom SW       |       High |
| Object storage       | S3                      |       High |
| Auth                 | Custom Nest-controlled  |       High |
| Compute              | AWS ECS/Fargate         |       High |
| DB hosting           | AWS RDS                 |       High |
| Frontend hosting     | Vercel                  |       High |
| Observability        | OpenTelemetry + Sentry  |       High |
| CI/CD                | GitHub Actions          |  Very High |
| Containers           | Docker                  |  Very High |
| Orchestration        | No Kubernetes initially |  Very High |
| Architecture         | Modular monolith        |  Very High |

---

# 50. The Parts I'd Still Discuss Before We Lock the Stack

There are really **four decisions** where I think a serious engineering discussion is worthwhile:

### A. Prisma vs Drizzle

I'm currently leaning Prisma, but Drizzle is technically compelling for this database-heavy system.

### B. AWS S3 vs Cloudflare R2

S3 is my default because the rest of the production infrastructure leans AWS. R2 is attractive because of its S3 compatibility and no-egress model. ([Cloudflare Docs][16])

### C. Custom authentication vs managed auth

I lean strongly toward custom application-controlled authentication because of the school/student credential model.

### D. Vercel frontend + AWS backend vs everything on AWS

I prefer **Vercel + AWS** for developer velocity and Next.js optimization, while keeping the exam/API infrastructure under our own AWS control. Vercel explicitly supports Next.js deployment and its own infrastructure optimizations. ([Vercel][18])

---

# My recommendation today

If we were starting the repository **today, August 24, 2026**, my baseline would be:

```text id="3k4v8f"
LANGUAGE
TypeScript

RUNTIME
Node.js 24 LTS

BACKEND
NestJS 11
Fastify

FRONTEND
Next.js 16.3
React
App Router

STATE
TanStack Query
Zustand / local domain state

CBT OFFLINE
IndexedDB
Dexie
Workbox

DATABASE
PostgreSQL 18.6
Prisma 8

CACHE / COORDINATION
Redis-compatible

QUEUE
BullMQ

REALTIME
SSE

OBJECT STORAGE
Amazon S3

AUTH
NestJS-controlled
Argon2id
HttpOnly secure sessions/tokens

WEB HOSTING
Vercel

API / WORKERS
AWS ECS Fargate

DATABASE
AWS RDS PostgreSQL

CACHE
Managed Redis / ElastiCache-compatible

OBSERVABILITY
OpenTelemetry
Sentry

CI/CD
GitHub Actions

CONTAINERIZATION
Docker

ARCHITECTURE
Modular Monolith
```

The version claims above are based on the current releases: Node 24 is LTS, Next.js 16.3 is current, NestJS 11 is current, and PostgreSQL 18.6 is current as of August 2026. ([Node.js][1])

I think **this is a very strong stack for the product**. More importantly, it doesn't just look modern—it maps directly onto the difficult parts of the system: PostgreSQL handles the authoritative transactional state, Nest gives us bounded modules and authorization, BullMQ/Redis absorb asynchronous work, and the Next.js/PWA client gives students a resilient local exam experience.

The next thing I'd do before writing a single line of production code is **turn this into the concrete repository/module architecture and infrastructure topology**—including the exact NestJS module structure, Next.js app structure, shared packages, database schema organization, API versioning conventions, worker queues, environment separation, and AWS/Vercel topology. That is where the stack becomes an actual engineering blueprint.

[1]: https://nodejs.org/en/about/previous-releases?utm_source=chatgpt.com 'Node.js — Node.js Releases'
[2]: https://docs.nestjs.com/guards?utm_source=chatgpt.com 'Guards | NestJS - A progressive Node.js framework'
[3]: https://docs.nestjs.com/techniques/performance?from=20423&from_column=20423&utm_source=chatgpt.com 'Performance (Fastify) | NestJS - A progressive Node.js framework'
[4]: https://nextjs.org/blog?utm_source=chatgpt.com 'Next.js by Vercel - The React Framework | Next.js by Vercel - The React Framework'
[5]: https://nextjs.org/blog/nextjs-across-platforms?utm_source=chatgpt.com 'Next.js Across Platforms: Adapters, OpenNext, and Our Commitments | Next.js'
[6]: https://developer.chrome.com/docs/workbox/service-worker-overview?hl=en&utm_source=chatgpt.com 'Service worker overview  |  Workbox  |  Chrome for Developers'
[7]: https://developer.chrome.com/docs/workbox/retrying-requests-when-back-online?utm_source=chatgpt.com 'Retrying requests when back online  |  Workbox  |  Chrome for Developers'
[8]: https://www.postgresql.org/support/versioning/?utm_source=chatgpt.com 'PostgreSQL: Versioning Policy'
[9]: https://www.prisma.io/docs/orm/reference/supported-databases?utm_source=chatgpt.com 'Databases supported by Prisma ORM | Prisma Documentation'
[10]: https://orm.drizzle.team/docs/transactions?utm_source=chatgpt.com 'Drizzle ORM - Transactions'
[11]: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/?utm_source=chatgpt.com 'Redis persistence | Docs'
[12]: https://docs.nestjs.com/techniques/queues?utm_source=chatgpt.com 'Queues | NestJS - A progressive Node.js framework'
[13]: https://docs.bullmq.io/guide/jobs/deduplication?utm_source=chatgpt.com 'Deduplication | BullMQ'
[14]: https://docs.nestjs.com/techniques?utm_source=chatgpt.com 'Documentation | NestJS - A progressive Node.js framework'
[15]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html?utm_source=chatgpt.com 'Retaining multiple versions of objects with S3 Versioning - Amazon Simple Storage Service'
[16]: https://developers.cloudflare.com/r2/get-started/s3/?utm_source=chatgpt.com 'S3 · Cloudflare R2 docs'
[17]: https://developers.cloudflare.com/r2/api/s3/api/?utm_source=chatgpt.com 'S3 API compatibility · Cloudflare R2 docs'
[18]: https://vercel.com/docs/frameworks/full-stack/nextjs?utm_source=chatgpt.com 'Next.js on Vercel'
[19]: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html?utm_source=chatgpt.com 'Introduction to backups - Amazon Relational Database Service'
[20]: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.Limitations.html?utm_source=chatgpt.com 'Limitations of Multi-AZ DB clusters for Amazon RDS - Amazon Relational Database Service'
[21]: https://opentelemetry.io/docs/what-is-opentelemetry/?utm_source=chatgpt.com 'What is OpenTelemetry? | OpenTelemetry'
