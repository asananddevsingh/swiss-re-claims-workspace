import { UnderConstruction } from '@/components/shell/under-construction'

export default function DashboardPage() {
  return (
    <UnderConstruction
      title="Dashboard"
      summary="Portfolio view across the claims book — volumes, ageing, and where work is stuck."
      planned={[
        'Intake volume by channel, so email and SFTP backlogs are visible before they become breaches',
        'Claims ageing buckets against service level targets',
        'Queue depth and throughput per adjudicator and per team',
        'Reserve movement and settlement value over time',
      ]}
    />
  )
}
