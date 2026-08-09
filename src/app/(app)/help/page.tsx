import { UnderConstruction } from '@/components/shell/under-construction'

export default function HelpPage() {
  return (
    <UnderConstruction
      title="Help"
      summary="Guidance for adjudicators, and a route to support when a claim will not behave."
      planned={[
        'Adjudication procedure guides linked from the claim status they apply to',
        'Keyboard shortcuts for the queue and the document workspace',
        'Raise a support ticket with the current claim and session context attached',
        'Release notes, so changes to the queue are not discovered by surprise',
      ]}
    />
  )
}
