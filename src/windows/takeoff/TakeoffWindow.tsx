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

  const handleChange = (name: string, value: string | number) => {
    setTakeoffData({ [name]: value } as Partial<typeof takeoff>)
    emit("takeoff-updated", { ...takeoff, [name]: value })
  }

  const handleNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.name, Number(e.target.value))
  }

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleChange(e.target.name, e.target.value)
  }

  const labelRow = "flex items-center gap-1 h-4"

  return (
    <div className="h-screen bg-black text-white p-3 flex flex-col gap-3">
      {/*  V2 + Trim + Flaps */}

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <div className={labelRow}>
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
            type="number"
            id="transitionAltitude"
            name="transitionAltitude"
            value={takeoff.transitionAltitude ?? ""}
            onChange={handleNumberInput}
            min={2000}
            max={20000}
            step={500}
            className="h-8 bg-slate-900/50 border-slate-600 text-white text-xs font-mono text-center px-1 focus-visible:ring-cyan-500"
            placeholder="—"
          />
        </div>
        <div className="space-y-1">
          <div className={labelRow}>
            <Label htmlFor="trim" className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              Trim
            </Label>
          </div>
          <Input
            type="number"
            id="trim"
            name="trim"
            value={takeoff.trim ?? ""}
            onChange={handleNumberInput}
            min={-1.0}
            max={15.5}
            step={0.1}
            className="h-8 bg-slate-900/50 border-slate-600 text-white text-xs font-mono text-center px-1 focus-visible:ring-cyan-500"
            placeholder="—"
          />
        </div>
      </div>

      {/* Thrust + Packs + Anti Ice */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <div className={labelRow}>
            <Label htmlFor="antiIce" className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              Anti Ice
            </Label>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-cyan-400 transition-colors" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[200px] bg-slate-800 border-slate-700">
                  Other than OFF will not set the flaps automatically on after start flow.
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
      </div>

      <Button
        onClick={() => getCurrentWindow().close()}
        className="w-full h-8 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm mt-3"
      >
        Ok
      </Button>
    </div>
  )
}
