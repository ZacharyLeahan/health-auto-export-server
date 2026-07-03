import { useQuery } from "@tanstack/react-query";
import { fetchTimeSeries, TimeSeriesPoint } from "../api";
import { useMemo } from "react";
import type uPlot from "uplot";
import AutoSizeUplot from "./AutoSizeUplot";
import { axisValuesUs } from "../utils/chartFormat";

interface Props {
  metric: string;
  start: string;
  end: string;
  label: string;
  unit: string;
  agg?: string;
  multiplier?: number;
}

export default function TimeSeriesChart({
  metric,
  start,
  end,
  label,
  unit,
  agg = "daily",
  multiplier = 1,
}: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["timeseries", metric, start, end, agg],
    queryFn: () => fetchTimeSeries(metric, start, end, agg),
  });

  const { opts, plotData } = useMemo(() => {
    if (!data || data.length === 0) {
      return { opts: null, plotData: null };
    }

    const points = data
      .map((point: TimeSeriesPoint) => {
        const time = Math.floor(new Date(point.time).getTime() / 1000);
        const rawValue = point.avg ?? point.min ?? point.max;
        const value = rawValue === null ? null : rawValue * multiplier;
        return { time, value };
      })
      .filter(
        (point): point is { time: number; value: number } =>
          Number.isFinite(point.time) &&
          point.value !== null &&
          Number.isFinite(point.value),
      );

    if (points.length === 0) {
      return { opts: null, plotData: null };
    }

    const times = new Float64Array(points.map((point) => point.time));
    const values = new Float64Array(points.map((point) => point.value));

    const opts: uPlot.Options = {
      width: 0,
      height: 300,
      series: [
        {},
        {
          label: `${label} (${unit})`,
          stroke: "#22d3ee",
          width: 2,
          fill: "rgba(34,211,238,0.08)",
        },
      ],
      axes: [
        {
          stroke: "#52525b",
          grid: { stroke: "#27272a", width: 1 },
          ticks: { stroke: "#27272a" },
          values: axisValuesUs,
        },
        {
          stroke: "#52525b",
          grid: { stroke: "#27272a", width: 1 },
          ticks: { stroke: "#27272a" },
          label: unit,
          labelSize: 14,
        },
      ],
      scales: { x: { time: true } },
      cursor: { drag: { x: true, y: false } },
    };

    return {
      opts,
      plotData: [times, values] as uPlot.AlignedData,
    };
  }, [data, label, unit, multiplier]);

  if (isLoading) {
    return (
      <div className="bg-zinc-900 rounded-lg p-6 h-[340px] animate-pulse" />
    );
  }

  if (error || !opts || !plotData) {
    return null;
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <AutoSizeUplot opts={opts} data={plotData} />
    </div>
  );
}
