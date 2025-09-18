// src/components/kpi/charts/TankLevelChart.tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
export default function TankLevelChart({ ts }: { ts?: { timestamps: string[]; level_percent: number[] } }) {
  const series = ts?.level_percent?.map((v, i) => ({ ts: ts.timestamps[i].slice(11,16), nivel: v })) ?? [];
  return (
    <Card className="rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Nivel del tanque (24h)</CardTitle></CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top:5, right:20, left:0, bottom:5 }}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="ts" tick={{fontSize:10}} /><YAxis tick={{fontSize:10}} domain={[0,100]} />
            <Tooltip /><Legend /><Line type="monotone" dataKey="nivel" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
