import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  stats: {
    visits_today: string
    visits_this_week: string
    sales_this_week: string
    follow_ups_due: string
  }
}

export function RepStats({ stats }: Props) {
  return (
    <div className="p-6 grid grid-cols-2 gap-4 max-w-lg">
      <Card>
        <CardHeader><CardTitle className="text-sm">Visits Today</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{stats.visits_today}</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Visits This Week</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{stats.visits_this_week}</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Sales This Week</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{stats.sales_this_week}</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Follow-ups Due</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{stats.follow_ups_due}</p></CardContent>
      </Card>
    </div>
  )
}
