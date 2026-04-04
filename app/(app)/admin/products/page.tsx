import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'

export default async function ProductsPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const rows = await db.select().from(products).orderBy(products.name)

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Products</h1>
      </div>
      <ul className="space-y-2">
        {rows.map(p => (
          <li key={p.id} className="flex items-center justify-between border rounded p-3">
            <div>
              <span className="font-medium">{p.name}</span>
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            </div>
            <Badge variant={p.active ? 'default' : 'secondary'}>
              {p.active ? 'Active' : 'Inactive'}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
