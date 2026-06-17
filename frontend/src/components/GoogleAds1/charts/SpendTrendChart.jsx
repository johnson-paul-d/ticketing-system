import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

const USD_TO_INR = 1;

const SpendTrendChart = ({ trends }) => {
  // Aggregate spend & conversions by date
  const chartData = useMemo(() => {
    const dailyMap = new Map();
    trends.forEach(item => {
      const date = item.report_date;
      if (!date) return;
      const spendUSD = Number(item.cost) || 0;
      const conversions = Number(item.conversions) || 0;
      const existing = dailyMap.get(date) || { date, spendINR: 0, conversions: 0 };
      existing.spendINR += spendUSD * USD_TO_INR;
      existing.conversions += conversions;
      dailyMap.set(date, existing);
    });
    return Array.from(dailyMap.values()).sort((a,b) => new Date(a.date) - new Date(b.date));
  }, [trends]);

  if (!chartData.length) {
    return (
      <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5 text-center">
        <p className="text-slate-500">No trend data available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-4">
      <h3 className="text-sm font-bold text-white mb-2">Spend vs Conversions Trend</h3>
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              angle={-30}
              textAnchor="end"
              height={50}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`}
              tick={{ fill: '#60a5fa' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => Number(v).toFixed(2)}
              tick={{ fill: '#f472b6' }}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === 'Spend (INR)')
                  return [`₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, name];
                return [Number(value).toFixed(2), name];
              }}
              labelFormatter={(label) => `Date: ${label}`}
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="spendINR"
              name="Spend (INR)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversions"
              name="Conversions"
              stroke="#ec4899"
              strokeWidth={2}
              dot={false}
            />
            <ReferenceLine yAxisId="left" y={0} stroke="#334155" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SpendTrendChart;