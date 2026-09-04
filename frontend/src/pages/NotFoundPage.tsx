import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

import { Button } from '@/components/ui/primitives'
import { EmptyState } from '@/components/ui/primitives'
import { PageBody } from '@/components/app/shared'

export function NotFoundPage() {
  return (
    <PageBody className="mx-auto max-w-lg pt-16">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="That URL does not match anything in TalentRank. It may have been renamed or removed."
        action={
          <Button asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    </PageBody>
  )
}
