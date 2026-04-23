import { emit } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Info } from "lucide-react"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { usePerformanceStore } from "@/store/performanceStore"

const selectCls =
  "w-full h-8 bg-slate-900/50 border border-slate-600 text-white text-xs rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"

const formatToFL = (value: number | undefined | null) => {
  if (!value) return ""
  // Converts 18000 -> "FL180"
  return `FL${Math.floor(value / 100)
    .toString()
    .padStart(3, "0")}`
}

export function LandingWindow() {
  const { landing, setLandingData } = usePerformanceStore()

  useEffect(() => {
    getCurrentWindow()
      .show()
      .catch(() => {})
  }, [])

  const handleChange = (name: string, value: string | number) => {
    setLandingData({ [name]: value } as Partial<typeof landing>)
    emit("landing-updated", { ...landing, [name]: value })
  }

  const handleNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.name, Number(e.target.value))
  }

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleChange(e.target.name, e.target.value)
  }

  return (
    <div className="h-screen bg-black text-white p-3 flex flex-col gap-3 overflow-hidden">
      <div className="grid grid-cols-2 gap-2">
        {/* Flaps */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="flaps" className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              Flaps
            </Label>
          </div>
          <select id="flaps" className={selectCls} value={landing.flaps} onChange={handleSelectChange}>
            <option value="35">35</option>
            <option value="50">50</option>
          </select>
        </div>

        {/* Transition Level */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">TL</Label>
            <span className="text-[11px] font-mono text-cyan-500/80 leading-none">
              {formatToFL(landing.transitionLevel)}
            </span>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            className="h-8 bg-slate-900/50 border-slate-600 text-white text-xs font-mono text-center px-1 focus-visible:ring-cyan-500"
            value={landing.transitionLevel ?? ""}
            onChange={(e) => {
              const val = e.target.value
              if (val === "" || /^\d+$/.test(val)) {
                handleChange("transitionLevel", val === "" ? "" : Number(val))
              }
            }}
            onWheel={(e) => {
              e.preventDefault()
              const delta = e.deltaY < 0 ? 500 : -500
              const current = landing.transitionLevel ?? 0
              const snapped = Math.min(22000, Math.max(3000, Math.round((current + delta) / 500) * 500))
              handleChange("transitionLevel", snapped)
            }}
          />
        </div>

        {/* Anti Ice */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="antiIce" className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              Anti Ice
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-cyan-400 transition-colors" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[200px] bg-slate-800 border-slate-700">
                  Restricts flaps to 28° if used. Note: On 'Auto-AICE' airframes, Anti-Ice is managed by the aircraft
                  and will not be triggered by this flow.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <select id="antiIce" className={selectCls} value={landing.antiIce} onChange={handleSelectChange}>
            <option value="off">OFF</option>
            <option value="oneng">ENG</option>
            <option value="onengfoil">ENG+FOIL</option>
          </select>
        </div>

        {/* Missed Approach */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Missed App (ft)</Label>
          </div>
          <Input
            type="number"
            min={1000}
            max={20000}
            step={landing.missedAltitude >= 10000 ? 500 : 100}
            id="missedAltitude"
            name="missedAltitude"
            value={landing.missedAltitude}
            onChange={handleNumberInput}
            className="h-8 bg-slate-900/50 border-slate-600 text-white text-xs font-mono text-center px-1 focus-visible:ring-cyan-500"
            placeholder="—"
          />
        </div>
      </div>

      <Button
        onClick={() => getCurrentWindow().close()}
        className="w-full h-8 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm mt-auto"
      >
        Ok
      </Button>
    </div>
  )
}
