# Personal-Data Breach Response

**Status:** Operational draft; notification deadlines require legal approval

## Severity and activation

Activate this procedure for suspected unauthorized access, cross-tenant exposure, credential
compromise, loss of academic evidence, public object access, malicious export, or leakage of minors'
personal data.

## Immediate actions

1. Open a restricted incident record; assign incident commander, security lead, and communications
   lead.
2. Preserve audit, application, database, object-storage, edge, and infrastructure evidence.
3. Contain without destroying evidence: revoke sessions/keys, isolate affected workloads, disable
   exports, block compromised accounts, and preserve snapshots before remediation.
4. Determine affected schools, records, data classes, time range, and whether tenant boundaries were
   crossed.
5. Rotate exposed secrets through the approved secret manager; never paste them into tickets or chat.

## Assessment and notification

- Privacy counsel determines whether the event is a legally reportable personal-data breach and the
  applicable regulator/data-subject deadlines.
- Notify each affected controller without undue delay using the counsel-approved channel.
- The notice records known facts, likely consequences, containment, recommended controller actions,
  contact point, and the schedule for updates. Do not speculate.

## Recovery

1. Remediate the root cause and verify tenant isolation and authorization.
2. Restore from known-good state where necessary and reconcile immutable academic evidence.
3. Monitor for recurrence and unauthorized use of exposed credentials or exports.
4. Require incident-commander approval before lifting containment.

## Closure

Publish an internal post-incident review containing timeline, scope, root cause, control failures,
corrective actions, owners, and deadlines. Link accepted residual risk to the threat model and update
the control-evidence matrix. Retain the incident record according to counsel-approved policy.
