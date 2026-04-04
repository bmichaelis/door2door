import { Card, CardContent } from '@/components/ui/card'

type Rep = { id: string; name: string; visits_this_week: string; sales_this_week: string }
type Coverage = { name: string; total_houses: string; visited_houses: string }

type Props = {
  stats: { reps: Rep[]; coverage: Coverage[] }
}

export function ManagerStats({ stats }: Props) {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <section>
        <h2 className="text-lg font-semibold mb-3">Team Activity (This Week)</h2>
        <div className="space-y-2">
          {stats.reps.map(r => (
            <Card key={r.id}>
              <CardContent className="pt-4 flex justify-between items-center">
                <span className="font-medium">{r.name}</span>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{r.visits_this_week} visits</span>
                  <span>{r.sales_this_week} sales</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-3">Neighborhood Coverage</h2>
        <div className="space-y-2">
          {stats.coverage.map((c, i) => {
            const pct = c.total_houses === '0' ? 0 : Math.round((+c.visited_houses / +c.total_houses) * 100)
            return (
              <div key={i} className="flex justify-between items-center border rounded p-3">
                <span>{c.name}</span>
                <span className="text-sm text-muted-foreground">{pct}% visited ({c.visited_houses}/{c.total_houses})</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
