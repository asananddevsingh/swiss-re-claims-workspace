import { UnderConstruction } from '@/components/shell/under-construction'

export default function AuditPage() {
  return (
    <UnderConstruction
      title="Audit"
      summary="The record of who did what, which a claims system needs for regulatory review."
      planned={[
        'Every claim mutation with actor, timestamp and previous value',
        'Authorisation denials, so attempted access outside a role is reviewable',
        'Document operation history — splits, merges and removals with their source versions',
        'Export for compliance review over a chosen date range',
      ]}
    />
  )
}
