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

ETA updates and correction endpoints are not implemented yet. Presence of their fields/event kinds in the model is not an implemented HTTP contract.

## Contents

- [Lists, details, contextual history, cancellation and no-show](#management)
- [Rescheduling](#reschedule)
- [Starting service](#start)
- [Completing service](#complete)

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

For cancel/no-show/reschedule/start/complete, keep the original body (including expectedRevision) and key when retrying the same latest operation. The same actor/key/hash replays without another appointment revision/event; guard increments may still occur. Same key with changed intent returns COMMAND_KEY_CONFLICT (409). Replay remains subject to current authorization and is not promised after a later command supersedes the receipt.
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
