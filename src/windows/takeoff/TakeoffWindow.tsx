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

export function TakeoffWindow() {
  const { takeoff, setTakeoffData } = usePerformanceStore()

  useEffect(() => {
    getCurrentWindow()
      .show()
      .catch(() => {})
  }, [])

  const handleChange = (name: string, value: string | number | boolean) => {
    setTakeoffData({ [name]: value } as Partial<typeof takeoff>)
    emit("takeoff-updated", { ...takeoff, [name]: value })
  }

  const handleNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.name, Number(e.target.value))
  }

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleChange(e.target.name, e.target.value)
  }

  return (
    <div className="h-screen bg-black text-white p-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {/* Transition Altitude */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="transitionAltitude"
              className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest"
            >
              TA
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-cyan-400 transition-colors" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[200px] bg-slate-800 border-slate-700">
                  Transition Altitude
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            id="transitionAltitude"
            name="transitionAltitude"
            value={takeoff.transitionAltitude ?? ""}
            onChange={(e) => {
              const val = e.target.value
              if (val === "" || /^\d+$/.test(val)) {
                handleChange("transitionAltitude", val === "" ? "" : Number(val))
              }
            }}
            onWheel={(e) => {
              e.preventDefault()
              const delta = e.deltaY < 0 ? 500 : -500
              const current = takeoff.transitionAltitude ?? 0
              const snapped = Math.min(20000, Math.max(2000, Math.round((current + delta) / 500) * 500))
              handleChange("transitionAltitude", snapped)
            }}
            onBlur={(e) => {
              const val = Number(e.target.value)
              if (!isNaN(val) && val !== 0) {
                handleChange("transitionAltitude", Math.min(20000, Math.max(2000, val)))
              }
            }}
            className="h-8 bg-slate-900/50 border-slate-600 text-white text-xs font-mono text-center px-1 focus-visible:ring-cyan-500"
            placeholder="—"
          />
        </div>

        {/* Trim */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="trim" className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              Trim
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-cyan-400 transition-colors" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[200px] bg-slate-800 border-slate-700">
                  Negative values are Airplane Nose Down and Positive are Airplane Nose Up
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            type="number"
            id="trim"
            name="trim"
            // Check if trim exists, then format to 1 decimal place
            value={typeof takeoff.trim === "number" ? takeoff.trim.toFixed(1) : ""}
            onChange={handleNumberInput}
            min={-1.0}
            max={15.5}
            step={0.1}
            className="h-8 bg-slate-900/50 border-slate-600 text-white text-xs font-mono text-center px-1 focus-visible:ring-cyan-500"
            placeholder="—"
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
                  Anti ice won't be set on after start flow if aircraft is fitted with Automatic Anti Ice.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <select
            id="antiIce"
            name="antiIce"
            value={takeoff.antiIce}
            onChange={handleSelectChange}
            className={selectCls}
          >
            <option value="off">OFF</option>
            <option value="oneng">ENG</option>
            <option value="onengfoil">ENG+AIRFOIL</option>
          </select>
        </div>

        {/* Arm NAV */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Arm NAV?</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-cyan-400 transition-colors" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[200px] bg-slate-800 border-slate-700">
                  FO will arm NAV if selected but will skip arming if deselected. Deselect this if you are flying a
                  vectored departure.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center justify-center h-8">
            <input
              type="checkbox"
              id="armNav"
              checked={takeoff.armNav ?? true}
              onChange={(e) => handleChange("armNav", e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900/50 accent-cyan-500 cursor-pointer"
            />
          </div>
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
