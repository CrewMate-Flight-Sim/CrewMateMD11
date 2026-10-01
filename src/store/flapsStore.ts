import { create } from "zustand"

interface FlapsStore {
  previousFlapsPosition: number | null
  setPreviousFlapsPosition: (position: number) => void
}

export const useFlapsStore = create<FlapsStore>()((set) => ({
  previousFlapsPosition: null,
  setPreviousFlapsPosition: (position) => set({ previousFlapsPosition: position })
}))
