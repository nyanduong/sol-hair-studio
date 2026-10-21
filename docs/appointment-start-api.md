# SOL-036 Step 1 - Start assigned appointments

## Scope and sources

Business requirements: database/business-rules.md BR-02, BR-04, BR-05/06 and BR-09; database/schema.md appointments and appointment_events.
User decision: pressing Start confirms the customer is physically present. No check-in field or separate check-in workflow is added.
This step does not implement completion, ETA updates or correction.

## HTTP contract

POST /api/appointments/:appointmentId/start
Authorization: Bearer <active Stylist or Owner session>
Idempotency-Key: <16-100 character command key>
Content-Type: application/json

Body: {"expectedRevision":0}. No client timestamp, status, actor or check-in fields are accepted.
Owner may start any shop appointment. Stylist must match the currently assigned Staff profile, resolved by accountId again inside the transaction. An unrelated Stylist receives 404; Customer receives 403.

200: {status:"success",data:<role-scoped appointment DTO plus revision, confirmedAt, startedAt>} with Cache-Control: no-store.
Status becomes in_progress; startedAt is server-now, revision increases once. startAt/endAt, service/contact snapshots, totals and confirmedAt stay unchanged.
occupiedFrom=min(startAt,startedAt); occupiedUntil=endAt+10 minutes. The existing availability interval calculation handles overdue in-progress as an unknown end, rather than advertising free slots.

## Checks and atomic writes

- Only confirmed without startedAt; expectedRevision must match and remain within safe integer range.
- Early start is allowed if the full operational interval fits one active shift, avoids time off and conflicts with neither another Staff interval (including cleanup) nor another interval for the same Customer (excluding cleanup).
- Actual start is not forced onto the scheduled 15-minute grid and does not apply booking lead-time or horizon.
- Late start records actual server time, never backdates it. When planned end has passed, conflict detection treats the new serving end as unknown; shift validation covers the retained planned interval and current time plus cleanup. No ETA is fabricated.
- Uses shared calendar reader and shared appointmentInterval calculation; no duplicate slot engine and no rereading catalog to rewrite historical services/capabilities.
- Customer guard then Staff guard, reread actor/assignment/state, check latest command receipt, validate availability, CAS confirmed/revision, insert started event, commit. All session reads run sequentially.
- A failed command rolls back appointment, guards and event. Same latest actor/key/body replays without another revision or event. A replay may still increment resource guards, as with SOL-035.

## Errors

400: shared invalid body/revision/key/appointment-ID errors.
401: missing, invalid or revoked session.
403: insufficient role.
404: missing or out-of-scope appointment.
409: APPOINTMENT_REVISION_CONFLICT, APPOINTMENT_STATE_CONFLICT, APPOINTMENT_REVISION_LIMIT, START_OUTSIDE_SHIFT, START_TIME_OFF_CONFLICT, START_APPOINTMENT_CONFLICT, shared guard/resource/receipt/key conflicts.
503: shared database-unavailable or command-result-unknown response. Preserve key/body when retrying an unknown result.

## Verification boundary

Tests use a newly created MongoDB 8.0.17 memory-server replica set with synthetic data, never local/production databases. API tests cover on-time/early/late start, Owner/assigned Stylist, authorization, state, shifts, time off, cleanup/customer overlap, overdue conflicts, revision, rollback and concurrent/replayed requests.
No UI, physical customer-presence verification, completion, ETA writer or correction is claimed by this step.
