# Appointments API - SOL-035 and SOL-036

Single reference for the implemented SOL-035/036 appointment management HTTP APIs. SOL-031 booking remains documented separately in [booking-api.md](booking-api.md). Future appointment operations should extend this file rather than create separate per-operation API documents.
Business requirements remain in [business-rules.md](database/business-rules.md), [schema.md](database/schema.md) and [queries-and-indexes.md](database/queries-and-indexes.md).
Availability remains a separate shared API: [availability-api.md](availability-api.md). UI contracts and acceptance evidence describe different concerns and are not duplicate API references.

## Endpoint inventory

| Method | Endpoint | Roles / scope | Status |
| --- | --- | --- | --- |
| GET | /api/appointments | Customer own; Stylist assigned; Owner whole shop | Implemented SOL-035 |
| GET | /api/appointments/:appointmentId | Same role-based object scope | Implemented SOL-035 |
| GET | /api/appointments/:appointmentId/service-history | Assigned Stylist or Owner; contextual completed history | Implemented SOL-035 |
| POST | /api/appointments/:appointmentId/cancel | Customer own or Owner | Implemented SOL-035 |
| POST | /api/appointments/:appointmentId/no-show | Owner only | Implemented SOL-035 |
| POST | /api/appointments/:appointmentId/reschedule | Customer own or Owner | Implemented SOL-035 |
| POST | /api/appointments/:appointmentId/start | Assigned Stylist or Owner | Implemented SOL-036 Step 1 |
| POST | /api/appointments/:appointmentId/complete | Assigned Stylist or Owner | Implemented SOL-036 Step 2 |
| POST | /api/appointments/:appointmentId/eta | Assigned Stylist or Owner | Implemented SOL-036 Step 3 |
| POST | /api/appointments/:appointmentId/correct-start | Owner only | Implemented SOL-036 Step 4 |
| POST | /api/appointments/:appointmentId/correct-complete | Owner only | Implemented SOL-036 Step 5 |

The table lists implemented HTTP operations; UI/native acceptance and deployed CI results remain separate verification steps.

## Contents

- [Lists, details, contextual history, cancellation and no-show](#management)
- [Rescheduling](#reschedule)
- [Starting service](#start)
- [Completing service](#complete)
- [Updating ETA and affected appointments](#eta)
- [Correcting an accidental start](#correct-start)
- [Correcting an accidental completion](#correct-complete)

<a id="management"></a>
## SOL-035 - Read and manage appointments

All endpoints require an active Bearer session. Success is {status:"success",data:...}; business errors are {status:"error",code,message}. Responses use Cache-Control: no-store. Object scope is enforced server-side; missing/out-of-scope appointments return 404.

### Lists: GET /api/appointments

| Role | Accepted query | Default / max limit | Order |
| --- | --- | --- | --- |
| Customer | limit, cursor | 20 / 50 | startAt DESC, _id DESC |
| Stylist | localDate (required), limit, cursor | 50 / 100 | startAt ASC, _id ASC |
| Owner | localDate (required), staffId, status, limit, cursor | 50 / 100 | startAt ASC, _id ASC |

localDate is a valid YYYY-MM-DD salon date. Unsupported filters are rejected, never allowed to expand identity scope. Stylist views only assigned confirmed/in_progress/completed appointments. Owner status filters accept the model enum. An empty list returns 200 with items:[], not 404.
Response data: {items:[appointment DTO],pagination:{limit,hasNextPage,nextCursor}}. Cursor is opaque to clients and must be copied from the response, not constructed or reused across different filters. Invalid cursor/query/limit/date/filter returns 400.

### Details: GET /api/appointments/:appointmentId

No request body. Returns 200 with role-scoped appointment DTO plus revision and confirmedAt. Stylist detail access is restricted to assigned confirmed/in_progress/completed appointments. Invalid ID returns 400; missing/out-of-scope returns 404.
DTO allowlist: id, staffId, staffNameSnapshot, items (serviceId/name/priceVnd/durationMinutes), totalPriceVnd, totalDurationMinutes, startAt, endAt, timeZone, localDate, status. Stylist/Owner additionally receive customerSnapshot (displayName/phone); only Owner receives customerId. Account/email, guards, receipts and raw audit documents are not exposed.
The current detail DTO does not expose every lifecycle timestamp merely because it exists in the model; Start returns startedAt in its command response.

### Contextual history: GET /api/appointments/:appointmentId/service-history

Only Owner or the context appointment's assigned Stylist. Customer receives 403; an inaccessible context returns 404. The server resolves the Customer through the appointment, never accepts an arbitrary customerId.
Query: limit (default 20, max 50), cursor. Return completed appointments for that profile, including completed services by other Staff, ordered completedAt DESC then _id DESC. Response uses the same pagination envelope and contact-free DTO plus completedAt. No cancelled/no-show history, email or audit data is returned.

### Cancellation: POST /api/appointments/:appointmentId/cancel

Headers: Bearer session, Idempotency-Key (16-100 characters), Content-Type: application/json.
Body: {"expectedRevision":0,"reason":"Optional unless Owner cancels within two hours of the old start"}.
Only confirmed/not-started appointments. Customer can cancel their own appointment when old start >= server-now+2h, including exact equality. Owner can cancel before actual service; reason required when old start is less than two hours away, including after planned start. Reason, if supplied, is nonblank and <=500 characters.
200 returns role-scoped DTO plus revision, confirmedAt and cancelledAt. State becomes cancelled; reservation history remains but no longer blocks new bookings. Guard, revision CAS, receipt and cancelled event are atomic.
400 includes invalid body/revision/key/reason and CANCELLATION_REASON_REQUIRED; 409 includes CANCELLATION_CUTOFF and shared state/revision/guard/receipt conflicts.

### No-show: POST /api/appointments/:appointmentId/no-show

Owner only. Same command headers.
Body: {"expectedRevision":0,"contactAttemptedAt":"2026-10-21T03:15:00.000Z"} (timestamp is an example, use the actual contact time).
Only confirmed/not-started, server-now >= startAt+15 minutes. Owner attests that the customer has not arrived and has been contacted. contactAttemptedAt is canonical UTC ISO and cannot be in the future.
200 returns role-scoped DTO plus revision, confirmedAt, noShowAt and contactAttemptedAt. State becomes no_show; no automatic penalty, lockout, reopening or replacement booking. A returning customer needs a new booking.
400 includes INVALID_CONTACT_ATTEMPTED_AT and shared input errors; 409 includes NO_SHOW_TOO_EARLY and shared state/revision/guard/receipt conflicts.

### Shared management-command retry behavior

For cancel/no-show/reschedule/start/complete/eta/correct-start/correct-complete, keep the original body (including expectedRevision) and key when retrying the same latest operation. The same actor/key/hash replays without another appointment revision/event; guard increments may still occur. Same key with changed intent returns COMMAND_KEY_CONFLICT (409). Replay remains subject to current authorization and is not promised after a later command supersedes the receipt.
Unknown transaction result returns APPOINTMENT_COMMAND_RESULT_UNKNOWN (503). Preserve intent/key and inspect/retry; do not assume definite failure. Failed transactions leave no partial appointment/event/guard updates. Receipts for these commands are lastCommand, separate from Booking's 24-hour booking_requests receipt.

<a id="reschedule"></a>
## SOL-035 - Rescheduling

This document describes the implementation for review. URL, error codes and body shape are the implemented technical contract; shared consumers should confirm adoption before integration.
Business requirements: database/business-rules.md BR-01 to BR-06; availability-api.md.

### Request

POST /api/appointments/:appointmentId/reschedule
Authorization: Bearer <Customer or Owner session>
Idempotency-Key: <16-100 character command key>
Content-Type: application/json

Body example:

~~~json
{
  "expectedRevision": 0,
  "startAt": "2026-10-22T03:30:00.000Z",
  "staffId": "555555555555555555555555",
  "reason": "Owner contacted customer to agree a new time"
}
~~~

- expectedRevision is required, safe integer >= 0.
- At least one of startAt or staffId is required; omitted values stay unchanged.
- startAt must be canonical ISO UTC with milliseconds; it follows the 15-minute grid.
- reason is optional unless Owner changes an appointment less than two hours before its OLD start (including after that start). If present, nonblank and <= 500 characters.
- No actual time/Staff change returns 400 RESCHEDULE_NO_CHANGE. No revision/event is created.
- Reject all other fields, including serviceIds/items, prices, duration, customerId, status and actor.

### Authorization and time rules

- Customer: own profile only, OLD start at least two hours from server-now; new start at least 30 minutes ahead.
- Owner: all shop appointments, reason for late changes; new scheduled start is not before server-now. No customer lead-time is applied to Owner.
- Stylist alone: 403. When Owner and Customer roles coexist, Owner context wins.
- Only confirmed with no startedAt. Other states cannot be reopened by this operation.
- New start <= now + 168 hours, inclusive. Both time-only and Staff-only changes are checked.
- All limits use the actor/time reread during the transaction, not bookingMode or client clock.

### Snapshot and availability

Service IDs, names, prices, durations, totals, buffer, customerSnapshot, bookingMode and confirmedAt stay unchanged.
Time-only changes preserve historical staffNameSnapshot. Reassignment snapshots the newly selected Staff displayName.
Availability uses snapshot service IDs and totalDurationMinutes; it does not reread catalog prices or require historical services to remain active.
Target Staff and linked Account must be active, with the required capabilities. The new occupied interval, including 10-minute cleanup, must fit one active shift and avoid time off/other Staff intervals. Customer overlap excludes cleanup. Overdue in-progress with unknown end remains busy.
The current appointment is excluded by ID. Existing shared calculateStaffSlots remains the source of interval calculations.

### Transaction and retry

1. Validate request and hash canonical intent once.
2. Pre-read Customer/old Staff IDs.
3. Increment Customer guard, then sorted/deduplicated old and target Staff guards.
4. Reread actor and appointment with the same session; abort/retry boundedly if resources changed.
5. Authorize, check latest receipt, revision/state/cutoff; read target capabilities and calendar with that session.
6. Validate the complete proposed document and CAS old ID/Customer/Staff/revision/confirmed/not-started.
7. Write rescheduled audit event and lastCommand in that transaction; respond only after commit.

Reader changes are backwards compatible: findEligibleStaff accepts an optional {session}; findAvailabilityCalendar accepts optional {session, excludeAppointmentId}. Reads are sequential when a session is supplied, parallel for the existing GET API.

Retry keeps the same key and complete body (including original expectedRevision). A matching latest actor/key/hash receipt returns the current command result without a new appointment revision/event. Guard increments can still occur on replay. This does not promise replay of commands superseded by a later command.
Unknown commit/operation timeout returns 503 APPOINTMENT_COMMAND_RESULT_UNKNOWN; inspect the appointment and retain the same intent/key when retrying.

### Response and errors

200: {status: "success", data: <role allowlist with revision, confirmedAt, lastRescheduledAt>}.
Planned times, occupied interval and localDate are recalculated; status remains confirmed.

- 400: INVALID_REQUEST_BODY, INVALID_REVISION, INVALID_COMMAND_KEY, INVALID_START_AT, INVALID_STAFF_ID, INVALID_REASON, RESCHEDULE_CHANGE_REQUIRED, RESCHEDULE_NO_CHANGE, RESCHEDULE_REASON_REQUIRED.
- 401/403: invalid/revoked session or insufficient role.
- 404: missing/out-of-scope appointment.
- 409: RESCHEDULE_CUTOFF, RESCHEDULE_LEAD_TIME, RESCHEDULE_HORIZON, APPOINTMENT_REVISION_CONFLICT, APPOINTMENT_STATE_CONFLICT, APPOINTMENT_REVISION_LIMIT, STAFF_UNAVAILABLE, SLOT_UNAVAILABLE, guard/resource conflicts, command key/receipt conflicts.
- 503: database unavailable or command result unknown.

### Scope and remaining integration

Rescheduling does not create bookings, booking_requests receipts, catalog backfills, time-off writers, notifications, migrations or seeds. SOL-031 booking creation is implemented in the same module (see [booking-api.md](booking-api.md)) and shares the Customer/Staff guard protocol. GET availability does not reserve a slot.
The endpoint is tested with fixtures on a temporary MongoDB replica set, not live shared database data.

### Owner start-time boundary

Owner newStart >= server-now, including exact equality on a valid scheduled 15-minute grid. The baseline checker accepts lastRescheduledAt <= startAt and rejects a start before the command time. Runtime still validates against server-now; the persisted timestamp is not a substitute for that check. Customer cutoff/lead-time, Owner late-change reason and all availability checks remain unchanged.

<a id="start"></a>
## SOL-036 Step 1 - Start service

### Scope and sources

Business requirements: database/business-rules.md BR-02, BR-04, BR-05/06 and BR-09; database/schema.md appointments and appointment_events.
User decision: pressing Start confirms the customer is physically present. No check-in field or separate check-in workflow is added.
The Start endpoint does not perform completion (see the Complete service section below), ETA updates or correction.

### HTTP contract

POST /api/appointments/:appointmentId/start
Authorization: Bearer <active Stylist or Owner session>
Idempotency-Key: <16-100 character command key>
Content-Type: application/json

Body: {"expectedRevision":0}. No client timestamp, status, actor or check-in fields are accepted.
Owner may start any shop appointment. Stylist must match the currently assigned Staff profile, resolved by accountId again inside the transaction. An unrelated Stylist receives 404; Customer receives 403.

200: {status:"success",data:<role-scoped appointment DTO plus revision, confirmedAt, startedAt>} with Cache-Control: no-store.
Status becomes in_progress; startedAt is server-now, revision increases once. startAt/endAt, service/contact snapshots, totals and confirmedAt stay unchanged.
occupiedFrom=min(startAt,startedAt); occupiedUntil=endAt+10 minutes. The existing availability interval calculation handles overdue in-progress as an unknown end, rather than advertising free slots.

### Checks and atomic writes

- Only confirmed without startedAt; expectedRevision must match and remain within safe integer range.
- Early start is allowed if the full operational interval fits one active shift, avoids time off and conflicts with neither another Staff interval (including cleanup) nor another interval for the same Customer (excluding cleanup).
- Actual start is not forced onto the scheduled 15-minute grid and does not apply booking lead-time or horizon.
- Late start records actual server time, never backdates it. When planned end has passed, conflict detection treats the new serving end as unknown; shift validation covers the retained planned interval and current time plus cleanup. No ETA is fabricated.
- Uses shared calendar reader and shared appointmentInterval calculation; no duplicate slot engine and no rereading catalog to rewrite historical services/capabilities.
- Customer guard then Staff guard, reread actor/assignment/state, check latest command receipt, validate availability, CAS confirmed/revision, insert started event, commit. All session reads run sequentially.
- A failed command rolls back appointment, guards and event. Same latest actor/key/body replays without another revision or event. A replay may still increment resource guards, as with SOL-035.

### Errors

400: shared invalid body/revision/key/appointment-ID errors.
401: missing, invalid or revoked session.
403: insufficient role.
404: missing or out-of-scope appointment.
409: APPOINTMENT_REVISION_CONFLICT, APPOINTMENT_STATE_CONFLICT, APPOINTMENT_REVISION_LIMIT, START_OUTSIDE_SHIFT, START_TIME_OFF_CONFLICT, START_APPOINTMENT_CONFLICT, shared guard/resource/receipt/key conflicts.
503: shared database-unavailable or command-result-unknown response. Preserve key/body when retrying an unknown result.

### Verification boundary

Tests use a newly created MongoDB 8.0.17 memory-server replica set with synthetic data, never local/production databases. API tests cover on-time/early/late start, Owner/assigned Stylist, authorization, state, shifts, time off, cleanup/customer overlap, overdue conflicts, revision, rollback and concurrent/replayed requests.
No UI, physical customer-presence verification, completion, ETA writer or correction is claimed by this step.

<a id="complete"></a>
## SOL-036 Step 2 - Complete service

### Scope and sources

Business requirements: [business-rules.md](database/business-rules.md) BR-02, BR-04, BR-05/06 and BR-09; [schema.md](database/schema.md) appointments and appointment_events.
Pressing Complete records that service has actually finished. Completion is not payment. No ETA update or Owner correction endpoint is added.

### HTTP contract

POST /api/appointments/:appointmentId/complete
Authorization: Bearer <active assigned Stylist or Owner session>
Idempotency-Key: <16-100 character command key>
Content-Type: application/json

~~~json
{"expectedRevision":1}
~~~

Use the current revision from the Start response or appointment details; 1 above is an example. No client completedAt, status, payment, service or price fields are accepted.
Owner may complete any shop appointment. Stylist must still be the assigned Staff, resolved again by accountId inside the transaction. Customer receives 403; unrelated Stylist/missing appointment receives 404.

200: {status:"success",data:<role-scoped appointment DTO plus revision, confirmedAt, startedAt, completedAt>} with Cache-Control: no-store.
State becomes completed. completedAt is server-now, revision increases once; occupiedFrom=startedAt and occupiedUntil=completedAt+10 minutes.
startAt/endAt, service and contact snapshots, Staff assignment, prices, durations and confirmedAt remain unchanged.
An existing estimatedEndAt is removed from the current completed document because ETA is only valid while in_progress; the completed event retains that value in before. This does not implement an ETA writer.

### Actual time and availability

- Only in_progress with valid startedAt and matching expectedRevision can complete. Completion cannot precede actual start; exact equality is allowed.
- Early completion releases unused planned time after cleanup. Late completion extends the actual occupied interval; the system never backdates actual completion to avoid conflicts.
- Completion is not rejected merely because actual work overran a shift, overlaps a later appointment, or current catalog/capabilities changed. Existing other appointments are not moved, cancelled or edited.
- Availability already reads completed intervals. Staff stays busy until completedAt+10 minutes, Customer only until completedAt. New scheduled slots must still fit the 15-minute grid, shift/time-off, full service+cleanup, lead-time, horizon and other bookings.
- Example: completion 10:00, cleanup ends 10:10, earliest Owner scheduled grid is 10:15 if all other conditions pass. Completion 10:05 allows exact cleanup adjacency at 10:15. Customer's 30-minute lead still applies.

### Transaction, errors and retry

Reuses Customer then Staff guards, same-session current authorization, revision/state CAS, latest lastCommand receipt and completed audit event. Appointment, guards and event commit atomically; failures roll back together. Actual completion does not run the rescheduling slot validator.
Keep the same key and complete body, including the original expectedRevision, when retrying the latest command. Replay returns the same completedAt/revision without another event. A later command can supersede the receipt.

- 400: shared invalid body, revision, command key or appointment ID.
- 401/403/404: authentication, role or appointment scope as above.
- 409: APPOINTMENT_STATE_CONFLICT, APPOINTMENT_REVISION_CONFLICT, APPOINTMENT_REVISION_LIMIT, INVALID_COMPLETION_TIME, shared guard/resource/key/receipt conflicts.
- 503: database unavailable or APPOINTMENT_COMMAND_RESULT_UNKNOWN; preserve key/body and inspect/retry instead of assuming definite failure.

### Verification scope

Automated tests use the existing isolated MongoDB 8.0.17 replica set with synthetic data. They cover normal/early/late completion, actual overrun, cleanup/grid/customer lead-time, available service duration before the next booking, authorization, wrong states, revisions, transactional rollback, concurrent/duplicate requests and preservation of snapshots and unrelated appointments.
Live database, Postman, browser and native device acceptance are not claimed by this document.

<a id="eta"></a>
## SOL-036 Step 3 - Update ETA and report affected appointments

### Scope and sources

[Business rules](database/business-rules.md) BR-02/04/09 and [schema](database/schema.md) appointments/appointment_events.
BR-09 and the user requirement specify a future ETA: this endpoint requires estimatedEndAt > server-now, not equality. ETA must also be strictly later than planned endAt.
This is the implemented technical contract for client integration review, not an added business rule requiring all affected appointments to move.

### HTTP contract

POST /api/appointments/:appointmentId/eta
Authorization: Bearer <active assigned Stylist or Owner session>
Idempotency-Key: <16-100 character command key>
Content-Type: application/json

~~~json
{
  "expectedRevision": 1,
  "estimatedEndAt": "2026-10-21T04:30:00.000Z"
}
~~~

Use the appointment's current revision and a valid future instant; these values are examples.
Only expectedRevision and estimatedEndAt are accepted. ETA must be canonical UTC ISO with milliseconds and leave room for the cleanup interval within the supported Date range. Client role/status/planned times/services/prices/durations are rejected.
Only Owner or the currently assigned Stylist may update an in_progress appointment. Customer receives 403; an unrelated Stylist/missing appointment receives 404. Authorization is reread in the guarded transaction.

200: {status:"success",data:<role-scoped appointment DTO plus revision, confirmedAt, startedAt, estimatedEndAt, occupiedUntil, affectedAppointments, ownerReviewRequired>}.
Cache-Control: no-store. Status remains in_progress; revision increases once and event kind is eta_updated.
occupiedFrom=min(startAt,startedAt); occupiedUntil=max(endAt,estimatedEndAt)+10 minutes.
Planned times, service/contact snapshots, assignment, totals and durations remain unchanged. ETA does not complete service or introduce payment state.

### Validation and overrun behavior

- New ETA is > server-now and > endAt, including when the previous ETA has expired.
- No scheduled grid, 30-minute booking lead-time or 168-hour booking horizon is applied to actual ETA. A corrected estimate can be earlier than the previous estimate while still meeting the two strict inequalities.
- Ca/time-off/another reservation do not veto recording truthful ETA. Availability already reads ETA and cleanup using its existing interval calculation; no SOL-030 algorithm is changed.
- ETA never moves/cancels/reassigns affected appointments. Owner contacts customers and uses existing management operations.
- Current-document estimatedEndAt may later be removed by Complete; the eta_updated audit event remains append-only.

### Affected appointments and field security

The warning reader runs in the same transaction, excludes the current appointment, and examines confirmed/in_progress appointments of the same Staff or Customer profile. It uses shared appointmentInterval, including overdue unknown-end behavior. Only overlap affecting current/future time is reported; completed/cancelled/no_show appointments are excluded.
Staff comparison includes cleanup; Customer comparison excludes cleanup. Intervals are half-open: exact adjacency is not overlap. Results are deduplicated by appointment and sorted startAt ASC then _id ASC.

~~~json
{
  "affectedAppointments": [
    {
      "id": "555555555555555555555555",
      "staffId": "666666666666666666666666",
      "status": "confirmed",
      "startAt": "2026-10-21T04:15:00.000Z",
      "endAt": "2026-10-21T04:45:00.000Z",
      "reasons": ["staff_overlap"]
    }
  ],
  "ownerReviewRequired": true
}
~~~

- Owner receives all matching warnings, including customer_overlap on a different Staff.
- Stylist receives only matching appointments assigned to the same Staff. IDs/times/customer details from another Staff's appointments are never exposed; ownerReviewRequired can still be true when the visible list is empty.
- Allowed warning fields are id/staffId/status/startAt/endAt/reasons only. No name, phone, email, account/Customer ID, revision, receipt or audit is returned for affected appointments.
- An item can contain staff_overlap, customer_overlap or both. No truncation or total count exposes hidden appointments.
- ownerReviewRequired means a conflict needs manual attention, not that a notification was sent. There is no notification/background-dispatch implementation here.

### Transaction, receipt and retry

Reuses Customer then Staff guards, actor/assignment rereads, same-session reads and lifecycle CAS (in_progress + expectedRevision + actual startedAt). ETA, occupied interval, revision, lastCommand and eta_updated event are atomic. Warning-query failure also aborts the transaction; no partial success is reported.
Same actor/key/body replays the latest ETA without another revision/event, even after that ETA has passed. Current authorization remains required. ETA is included in the canonical hash; changed ETA with the same key returns 409 COMMAND_KEY_CONFLICT.
Warnings are recomputed from the current transaction snapshot on replay, so affectedAppointments/ownerReviewRequired may change while the saved ETA and revision stay unchanged. They are not persisted as an unbounded receipt/audit array.

### Errors and acceptance boundary

400: INVALID_ETA (missing/malformed/not-future/not-after-planned-end or unrepresentable cleanup), shared invalid body/revision/key/appointment-ID errors.
401/403/404: invalid session, role or object scope.
409: shared state/revision/guard/resource/receipt/key conflicts. Overlap itself is a 200 warning, not a conflict rejection.
503: database unavailable or APPOINTMENT_COMMAND_RESULT_UNKNOWN; retain the same key and body when retrying an unknown outcome.

Tests use synthetic fixtures on an isolated MongoDB replica set. No live database, Postman/UI/native acceptance or actual notification is claimed. Correction remains outside the ETA endpoint; accidental-start correction is described below.

<a id="correct-start"></a>
## SOL-036 Step 4 - Owner corrects an accidental start

### Sources and boundary

[Business rules](database/business-rules.md) BR-05/06: Owner may correct in_progress to confirmed only when Start was pressed accidentally and actual service has not begun. [Schema](database/schema.md) requires removing timestamps that do not belong to the restored status while retaining before/after history.
This endpoint does not implement completed to in_progress, reopen cancelled/no_show, reschedule, payment, or a check-in system.

### HTTP contract

POST /api/appointments/:appointmentId/correct-start
Authorization: Bearer <active Owner session>
Idempotency-Key: <16-100 character command key>
Content-Type: application/json

~~~json
{
  "expectedRevision": 1,
  "reason": "Start was pressed accidentally; actual service has not begun.",
  "serviceNotStarted": true
}
~~~

Use the current revision; 1 above is an example. This implemented technical contract uses serviceNotStarted:true as explicit Owner attestation in the request only. It is not a stored check-in field and cannot independently verify a physical salon event. The reason and Owner actor are retained in the corrected event.
reason is required, trimmed, nonblank and at most 500 characters. False/missing/string serviceNotStarted is rejected. No targetStatus, timestamps, ETA, assignment, services, prices or duration fields are accepted.
Only in_progress is accepted for a new command. Owner role is checked at the router and again inside the transaction, including replay. Stylist/Customer receive 403.

### Restore checks and successful response

Under the existing Customer then Staff guards, reread appointment/authorization and compare expectedRevision. Determine the restored reservation from the unchanged planned interval:

- Staff: [startAt,endAt+10 minutes).
- Customer: [startAt,endAt), excluding cleanup.
- The whole Staff interval must fit a single active shift and avoid time off.
- Check other confirmed/in_progress/completed intervals using the existing SOL-030 appointmentInterval calculation, including actual completion cleanup and unknown-end overdue service. Exclude the current appointment; cancelled/no_show do not block restoration.
- This is restoration, not a new booking. Do not apply new-booking grid/lead-time/horizon or rewrite historical catalog snapshots/capabilities.
- Planned times remain unchanged even if the request is submitted after planned start. No ETA is fabricated for confirmed status.

On success return 200 with {status:"success",data:<Owner appointment DTO plus revision, confirmedAt, occupiedFrom, occupiedUntil>}, Cache-Control:no-store.
Status becomes confirmed; remove startedAt/completedAt/estimatedEndAt from the current document. occupiedFrom=startAt, occupiedUntil=endAt+10 minutes. Keep startAt/endAt, assignment, customer/service snapshots, totals, duration, bookingMode and original confirmedAt.
The same transaction increments revision, replaces lastCommand and appends corrected with actorId/occurredAt/reason/before/after. Prior started/eta_updated events are neither edited nor deleted.

### Conflicts and errors

A restore conflict returns HTTP 409 without modifying appointment/event/guards:

~~~json
{
  "status": "error",
  "code": "CORRECTION_CONFLICT",
  "message": "The original reservation cannot be restored until conflicts are resolved.",
  "details": {
    "shiftConflict": false,
    "timeOffConflicts": [],
    "conflictingAppointments": [
      {
        "id": "555555555555555555555555",
        "staffId": "666666666666666666666666",
        "status": "confirmed",
        "startAt": "2026-10-21T03:30:00.000Z",
        "endAt": "2026-10-21T04:00:00.000Z",
        "reasons": ["staff_overlap"]
      }
    ]
  }
}
~~~

shiftConflict covers missing/cancelled/insufficient/split shift coverage. timeOffConflicts contains only startAt/endAt. Conflicting appointment fields are id/staffId/status/startAt/endAt/reasons, with staff_overlap and/or customer_overlap; no contact, email, account, receipt or audit fields. Owner can read cross-Staff conflicts for the same Customer. Other roles are denied before conflict details are computed.
Nothing is moved/cancelled/reassigned automatically. Owner resolves conflicts separately, then retries; a rejected transaction stores no command receipt.

Other errors:
- 400: CORRECTION_REASON_REQUIRED, INVALID_REASON, SERVICE_NOT_STARTED_CONFIRMATION_REQUIRED, shared invalid body/revision/key/appointment ID.
- 401/403/404: session, Owner role or missing appointment.
- 409: shared state/revision/guard/resource/key/receipt conflicts. completed/cancelled/no_show are not accepted.
- 503: database unavailable or APPOINTMENT_COMMAND_RESULT_UNKNOWN; preserve original key/body when retrying an unknown result.

### Idempotency and acceptance boundary

Same latest Owner/key/canonical body, including original expectedRevision and trimmed reason, replays the confirmed result without another revision/event. Replay does not reapply restore checks after unrelated calendar changes, but still checks current Owner authorization. A changed reason or revision with the same key returns COMMAND_KEY_CONFLICT. A later command can supersede the latest receipt.
Failures, including CAS/audit failures, roll back all writes. Tests use the isolated synthetic MongoDB replica set for success, authorization, state, reason/attestation, revision, shifts/time off, Staff/Customer/cleanup/overdue overlap, rollback, audit retention and concurrent/replayed requests. Live database/UI/manual salon acceptance is not claimed. Accidental-completion correction is described in the next section.

<a id="correct-complete"></a>
## SOL-036 Step 5 - Owner corrects an accidental completion

### Sources and scope

[Business rules](database/business-rules.md) BR-02/04/05/06 and [schema](database/schema.md) appointments/appointment_events allow only Owner to restore completed to in_progress when actual service is still continuing, with reason, audit and a fresh conflict check.
The shared SOL-030 interval/calendar readers remain unchanged. This endpoint does not reschedule, reopen cancelled/no_show, introduce check-in/payment or overwrite service snapshots.

### HTTP contract

POST /api/appointments/:appointmentId/correct-complete
Authorization: Bearer <active Owner session>
Idempotency-Key: <16-100 character command key>
Content-Type: application/json

~~~json
{
  "expectedRevision": 2,
  "reason": "Completion was pressed accidentally; the customer is still being served.",
  "serviceNotCompleted": true,
  "estimatedEndAt": "2026-10-21T04:30:00.000Z"
}
~~~

Values are examples: use the current revision and, when supplied, a valid future ETA.
Only expectedRevision/reason/serviceNotCompleted/estimatedEndAt are accepted. Reason is required, trimmed, nonblank and <=500 characters. serviceNotCompleted must be the boolean true, explicitly attesting that completion was accidental and actual service is still continuing; it is a request-only confirmation, not a model/check-in field. Current Owner permission is checked again in the transaction, including replay.
Client startedAt/completedAt/status, assignment, items, prices, duration and serviceNotStarted are rejected. Stylist and Customer receive 403 even if they could originally start or complete the appointment.

### ETA and restoration rules

- New commands require completed and matching expectedRevision. Never reuse this operation as an arbitrary state restore.
- Reuse original startedAt retained on the completed document. Do not replace it with server-now or infer a start from current catalog duration.
- If endAt <= server-now, estimatedEndAt is mandatory in this request. Equality is treated as expired because the existing availability reader treats an in_progress appointment whose planned/estimated end is at now as an unknown end.
- Supplied ETA is canonical UTC ISO with milliseconds, strictly > server-now and > endAt, with a representable cleanup end. Null/malformed/past/equal ETA is invalid even when ETA would otherwise be optional.
- If endAt is still future and ETA is absent, retain planned end for the restored busy interval. If ETA is supplied, use it. A previous ETA removed by Complete is not silently recovered from audit; the Owner must provide the current estimate when needed.
- Restore occupiedFrom=min(startAt,startedAt) and occupiedUntil=max(endAt,estimatedEndAt if provided)+10 minutes. The service end must be future at the guarded server-time validation of a new correction; do not create an already expired holding period or invent ETA.
- No booking lead-time, 15-minute grid or 168-hour booking horizon is imposed on actual restoration/ETA. Existing planned times and all snapshots remain unchanged.

### Fresh conflict check

Under Customer then Staff guards and the same MongoDB session, use the proposed in_progress interval with the shared SOL-030 appointmentInterval calculation. Check one active shift covering the whole Staff interval including cleanup, time off, and all related confirmed/in_progress/completed appointments. Exclude the current ID; cancelled/no_show do not block restoration.
Staff comparison includes cleanup; Customer comparison does not. Preserve half-open boundaries, actual completion cleanup and overdue in-progress unknown-end blocking.
Any conflict returns 409 CORRECTION_CONFLICT with the same Owner-only details contract as correct-start: shiftConflict, timeOffConflicts and conflictingAppointments (id/staffId/status/startAt/endAt/reasons). A new booking made in the released interval must be detected; correction and booking compete using the same guards.
Do not move, cancel, reassign or edit another appointment. A rejected correction leaves current completed state, completedAt, receipt, guards and audit unchanged. Owner resolves the conflict separately before retrying.

### Atomic update and response

200: {status:"success",data:<Owner appointment DTO plus revision, confirmedAt, startedAt, occupiedFrom, occupiedUntil and estimatedEndAt only when supplied>}, Cache-Control:no-store.
Status is in_progress. Remove completedAt from the current document; preserve original startedAt/startAt/endAt/customer/Staff assignment, all snapshots, totals, duration, bookingMode and confirmedAt.
The lifecycle CAS checks completed, expectedRevision, original startedAt and previous completedAt. Revision, lastCommand, restored fields and corrected event commit together. The event includes Owner actorId/server occurredAt/reason and bounded before/after. The old completed event (and any preceding started/eta_updated events) is neither edited nor deleted.
Availability immediately uses restored planned/ETA busy time plus cleanup; freed slots that now overlap are no longer advertised. No notification/payment operation occurs here.

### Errors and idempotency

- 400: CORRECTION_REASON_REQUIRED, INVALID_REASON, SERVICE_NOT_COMPLETED_CONFIRMATION_REQUIRED, CORRECTION_ETA_REQUIRED, INVALID_ETA and shared input/key/ID validation errors.
- 401/403/404: invalid session, insufficient Owner role or missing appointment.
- 409: CORRECTION_CONFLICT and shared state/revision/guard/resource/key/receipt conflicts.
- 503: database unavailable or APPOINTMENT_COMMAND_RESULT_UNKNOWN; keep original key/body when retrying an unknown result.

Canonical intent includes operation/appointment ID/expectedRevision/trimmed reason/confirmation and normalized optional ETA. Same latest Owner/key/body replays without another revision/event, even after the restored planned end or ETA has passed. Replay still checks current Owner permission but does not reapply a correction or invent a new ETA; the ordinary ETA API is used for a new operational update. A changed reason or ETA with the same key conflicts. A later command can supersede the latest receipt.
Any CAS/audit/calendar error aborts the full transaction. No partial restoration is reported.

### Verification boundary

Tests run only on the existing temporary MongoDB replica set with synthetic data. They cover the full Start/Complete/Correct lifecycle, original actual-time and event retention, ETA-required/equality/invalid cases, authorization, state/revision, shift/time-off/Staff/Customer/cleanup conflicts, real SOL-031 booking after false completion, cancellation resolving a conflict, booking-vs-correction races, rollback and duplicate requests, and availability after restoration.
API tests do not claim live database, Postman, browser/native UI or deployed GitHub Actions acceptance.
