# SOL-035 - Appointment rescheduling API

This document describes the implementation for review. URL, error codes and body shape are the implemented technical contract; shared consumers should confirm adoption before integration.
Business requirements: database/business-rules.md BR-01 to BR-06; availability-api.md.

## Request

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

## Authorization and time rules

- Customer: own profile only, OLD start at least two hours from server-now; new start at least 30 minutes ahead.
- Owner: all shop appointments, reason for late changes; new scheduled start is not before server-now. No customer lead-time is applied to Owner.
- Stylist alone: 403. When Owner and Customer roles coexist, Owner context wins.
- Only confirmed with no startedAt. Other states cannot be reopened by this operation.
- New start <= now + 168 hours, inclusive. Both time-only and Staff-only changes are checked.
- All limits use the actor/time reread during the transaction, not bookingMode or client clock.

## Snapshot and availability

Service IDs, names, prices, durations, totals, buffer, customerSnapshot, bookingMode and confirmedAt stay unchanged.
Time-only changes preserve historical staffNameSnapshot. Reassignment snapshots the newly selected Staff displayName.
Availability uses snapshot service IDs and totalDurationMinutes; it does not reread catalog prices or require historical services to remain active.
Target Staff and linked Account must be active, with the required capabilities. The new occupied interval, including 10-minute cleanup, must fit one active shift and avoid time off/other Staff intervals. Customer overlap excludes cleanup. Overdue in-progress with unknown end remains busy.
The current appointment is excluded by ID. Existing shared calculateStaffSlots remains the source of interval calculations.

## Transaction and retry

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

## Response and errors

200: {status: "success", data: <role allowlist with revision, confirmedAt, lastRescheduledAt>}.
Planned times, occupied interval and localDate are recalculated; status remains confirmed.

- 400: INVALID_REQUEST_BODY, INVALID_REVISION, INVALID_COMMAND_KEY, INVALID_START_AT, INVALID_STAFF_ID, INVALID_REASON, RESCHEDULE_CHANGE_REQUIRED, RESCHEDULE_NO_CHANGE, RESCHEDULE_REASON_REQUIRED.
- 401/403: invalid/revoked session or insufficient role.
- 404: missing/out-of-scope appointment.
- 409: RESCHEDULE_CUTOFF, RESCHEDULE_LEAD_TIME, RESCHEDULE_HORIZON, APPOINTMENT_REVISION_CONFLICT, APPOINTMENT_STATE_CONFLICT, APPOINTMENT_REVISION_LIMIT, STAFF_UNAVAILABLE, SLOT_UNAVAILABLE, guard/resource conflicts, command key/receipt conflicts.
- 503: database unavailable or command result unknown.

## Scope and remaining integration

No Booking creation, booking_requests receipt, catalog backfill, time-off writer, notification, migration or seed is added here. SOL-031 creation writer is still a separate dependency for full end-to-end booking. That writer must reuse the same guards/readers; GET availability does not reserve a slot.
The endpoint is tested with fixtures on a temporary MongoDB replica set, not live shared database data.

## Baseline ambiguity for review

The SOL-030 runtime and reschedule event checker allow Owner newStart == server-now on a valid scheduled grid; the generic example checker separately requires lastRescheduledAt < startAt. This implementation follows the SOL-030 scheduled rule (>= now) and tests it explicitly. Align the example-checker inequality with the agreed contract before treating it as a production migration validator; no approved business document/checker was edited here.
