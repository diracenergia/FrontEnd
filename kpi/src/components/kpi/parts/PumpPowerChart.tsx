import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { PumpTS } from "../types";

export default function PumpPowerChart({ ts }: { ts?: PumpTS }) {
  const series = ts?.power_kw?.map((v, i) => ({ ts: ts.timestamps[i].slice(11, 16), kw: v })) ?? [];
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">kW consumidos (24h)</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="kw" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}