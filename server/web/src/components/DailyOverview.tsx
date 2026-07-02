import { useQuery } from "@tanstack/react-query";
import { fetchLatestMetrics, HealthMetricRow, DailySum } from "../api";
import { useAvailableMetrics, type MetricOption } from "../hooks/useMetrics";

function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function getValue(row: HealthMetricRow, multiplier: number): string {
  const raw = row.AvgVal ?? row.Qty;
  if (raw === null || !Number.isFinite(raw)) return "—";
  return formatNumber(raw * multiplier);
}

function hasValue(
  row: HealthMetricRow,
  dailySum: DailySum | undefined,
  meta?: MetricOption,
): boolean {
  if (meta?.isCumulative && dailySum && Number.isFinite(dailySum.Total)) {
    return true;
  }

  const raw = row.AvgVal ?? row.Qty;
  return raw !== null && Number.isFinite(raw);
}

// Map raw Apple Health units to human-friendly display units
const UNIT_MAP: Record<string, Record<string, string>> = {
  heart_rate: { "count/min": "bpm" },
  resting_heart_rate: { "count/min": "bpm" },
  walking_heart_rate: { "count/min": "bpm" },
  respiratory_rate: { "count/min": "br/min" },
  heart_rate_variability: { ms: "ms" },
  environmental_audio_exposure: { dBASPL: "dB" },
  headphone_audio_exposure: { dBASPL: "dB" },
};

function displayUnit(metricName: string, rawUnit: string, meta?: MetricOption): string {
  if (meta?.unit) return meta.unit;
  return UNIT_MAP[metricName]?.[rawUnit] ?? rawUnit;
}

export default function DailyOverview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["latestMetrics"],
    queryFn: fetchLatestMetrics,
  });
  const { lookup, isLoading: metricsLoading } = useAvailableMetrics();

  if (isLoading || metricsLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 rounded-lg p-4 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-zinc-500 text-sm p-4 bg-zinc-900 rounded-lg">
        No data yet. Send health data to the ingest API to get started.
      </div>
    );
  }

  const latestRows = data.latest ?? [];
  const dailySums = data.daily_sums ?? [];
  const sumMap = new Map(dailySums.map((s) => [s.MetricName, s]));

  // Show only visible metrics the user has data for
  const ordered = latestRows
    .filter((m) => {
      const meta = lookup.get(m.MetricName);
      return meta?.visible && hasValue(m, sumMap.get(m.MetricName), meta);
    })
    .sort((a, b) => {
      const ma = lookup.get(a.MetricName)!;
      const mb = lookup.get(b.MetricName)!;
      return (ma.label ?? a.MetricName).localeCompare(mb.label ?? b.MetricName);
    });

  if (ordered.length === 0) {
    return (
      <div className="text-zinc-500 text-sm p-4 bg-zinc-900 rounded-lg">
        No data yet. Send health data to the ingest API to get started.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {ordered.map((m) => (
        <MetricCard
          key={m.MetricName}
          row={m}
          meta={lookup.get(m.MetricName)}
          dailySum={sumMap.get(m.MetricName) ?? null}
        />
      ))}
    </div>
  );
}

function MetricCard({
  row,
  meta,
  dailySum,
}: {
  row: HealthMetricRow;
  meta?: MetricOption;
  dailySum: DailySum | null;
}) {
  const label = meta?.label ?? row.MetricName;
  const isCumulative = meta?.isCumulative ?? false;
  const multiplier = meta?.multiplier ?? 1;

  let value: string;
  let unit: string;
  let subtitle: string;

  if (isCumulative && dailySum) {
    let total = dailySum.Total;
    let displayUnits = dailySum.Units;
    if (row.MetricName === "basal_energy_burned" && displayUnits === "kJ") {
      total = total / 4.184;
      displayUnits = "kcal";
    }
    value = formatNumber(total * multiplier);
    unit = displayUnit(row.MetricName, displayUnits, meta);
    subtitle = "today";
  } else {
    value = getValue(row, multiplier);
    unit = displayUnit(row.MetricName, row.Units, meta);
    subtitle = formatTimeAgo(row.Time);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 tabular-nums">
        {value}
        <span className="text-sm text-zinc-500 ml-1">{unit}</span>
      </div>
      <div className="text-xs text-zinc-600 mt-1">{subtitle}</div>
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
