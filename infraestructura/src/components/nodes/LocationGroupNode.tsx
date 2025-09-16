export default function LocationGroupNode({ data }: any) {
  const { label, w, h, alarms } = data as { label: string; w: number; h: number; alarms?: number };
  return (
    <div
      style={{ width: w, height: h }}
      className={`rounded-2xl border-2 ${alarms ? 'border-red-400' : 'border-slate-300'}
                  border-dashed bg-slate-50/80 shadow-inner p-3`}
    >
      <div className="text-xs font-medium px-2 py-0.5 bg-white/80 inline-block rounded-full border">
        {label}
      </div>
    </div>
  );
}
