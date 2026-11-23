import type { Settings } from "@/lib/settings";
import type { ProviderStatus } from "@/lib/types";
import { providerName, resolveTarget, usableProviders } from "@/lib/useProviders";
import { EFFORT_LABELS } from "./ui";
import { ChevronDown } from "lucide-react";

export function ModelPicker({
  settings,
  providers,
  onChange,
  disabled,
}: {
  settings: Settings;
  providers: ProviderStatus[];
  onChange: (sel: Settings["selection"]) => void;
  disabled?: boolean;
}) {
  const usable = usableProviders(settings, providers);
  const target = resolveTarget(settings, providers);
  if (!target) return <span className="text-xs text-muted">No model available</span>;
  const efforts = target.modelInfo?.efforts ?? [];

  return (
    <div className="flex shrink-0 items-center gap-1 text-xs text-muted">
      <label className="relative flex items-center rounded-md hover:bg-elevated hover:text-fg">
        <span className="sr-only">Model</span>
        <select
          disabled={disabled}
          className="max-w-[150px] cursor-pointer appearance-none truncate py-1 pr-6 pl-2 outline-none"
          value={`${target.provider}::${target.model}`}
          onChange={(e) => {
            const [provider, model] = e.target.value.split("::");
            onChange({ provider, model, effort: settings.selection.effort });
          }}
        >
          {usable.map((p) => (
            <optgroup key={p.id} label={providerName(settings, p)}>
              {p.models.map((m) => (
                <option key={m.id} value={`${p.id}::${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-1.5" />
      </label>
      {efforts.length > 0 && (
        <label className="relative flex items-center rounded-md hover:bg-elevated hover:text-fg">
          <span className="sr-only">Effort</span>
          <select
            disabled={disabled}
            className="cursor-pointer appearance-none py-1 pr-6 pl-2 outline-none"
            value={target.effort}
            onChange={(e) => onChange({ provider: target.provider, model: target.model, effort: e.target.value })}
          >
            {efforts.map((ef) => (
              <option key={ef} value={ef}>
                {EFFORT_LABELS[ef] ?? ef}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-1.5" />
        </label>
      )}
    </div>
  );
}
