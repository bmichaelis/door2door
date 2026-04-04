import { Card, CardContent } from '@/components/ui/card'

type TeamRow = { team_name: string; visits_this_month: string; sales_this_month: string; top_product: string | null }

type Props = { stats: TeamRow[] }

export function AdminStats({ stats }: Props) {
  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-3">Platform Activity (This Month)</h2>
      <div className="space-y-2">
        {stats.map((row, i) => (
          <Card key={i}>
            <CardContent className="pt-4 flex justify-between items-start">
              <div>
                <p className="font-medium">{row.team_name}</p>
                {row.top_product && <p className="text-sm text-muted-foreground">Top: {row.top_product}</p>}
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>{row.visits_this_month} visits</p>
                <p>{row.sales_this_month} sales</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
