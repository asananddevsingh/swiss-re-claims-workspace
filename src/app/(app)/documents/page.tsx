import { UnderConstruction } from '@/components/shell/under-construction'

export default function DocumentsPage() {
  return (
    <UnderConstruction
      title="Documents"
      summary="A document-first view of the same corpus the claims queue reaches through individual claims."
      planned={[
        'Search across all bundles, including documents not yet attached to a claim',
        'Intake tray for SFTP drops and email attachments awaiting classification',
        'Version history per document, showing every split and merge that produced it',
        'Bulk operations across selected documents, using the same job pipeline as the workspace',
      ]}
    />
  )
}
