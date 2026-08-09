# Disaster Recovery

## Targets

- Target RPO: 15 minutes for MongoDB; Redis queues are reconstructible from
  durable domain state.
- Target RTO: 4 hours.
- Encrypt backups in transit and at rest in a separate failure domain.
- Retain daily backups for 35 days and monthly backups according to legal
  policy.

## Recovery order

1. Declare the incident, freeze deployments, and preserve logs/audit evidence.
2. Restore MongoDB to an isolated environment and validate indexes and document
   counts.
3. Apply the erasure-tombstone ledger/audit decisions created after the restore
   point so deleted identities are not resurrected.
4. Provision empty durable Redis, then re-enqueue only domain records whose
   stored state proves work is incomplete.
5. Validate provider credentials, webhook signatures, encryption keys, and
   outbound-delivery disable switches.
6. Start workers with concurrency one, then scheduler, then API behind blocked
   ingress.
7. Run readiness, privacy-export, authentication, queue-idempotency, and report
   access smoke tests before reopening traffic.

Never restore Cloudinary objects that were legally erased. A database record
whose provider object is absent must remain honestly marked unavailable.

Run a restore drill at least quarterly. Record actual RPO/RTO, failed steps,
checksums, restored collection counts, and remediation owners. A backup is not
considered valid until a restore drill succeeds.
