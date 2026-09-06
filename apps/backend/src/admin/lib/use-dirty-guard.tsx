import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useBlocker } from "react-router-dom"

export const DIRTY_LEAVE_MESSAGE = "Есть несохранённые изменения. Уйти без сохранения?"

type DirtyGuardContextValue = {
  register: (key: string, dirty: boolean) => void
  isDirty: boolean
}

const DirtyGuardContext = createContext<DirtyGuardContextValue | null>(null)

function confirmLeave(): boolean {
  return window.confirm(DIRTY_LEAVE_MESSAGE)
}

function useBeforeUnloadGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])
}

function useRouterDirtyBlocker(dirty: boolean) {
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (confirmLeave()) blocker.proceed()
    else blocker.reset()
  }, [blocker])
}

function useDocumentDirtyGuard(dirty: boolean) {
  useBeforeUnloadGuard(dirty)
  useRouterDirtyBlocker(dirty)
}

export function DirtyGuardProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const register = useCallback((key: string, dirty: boolean) => {
    setFlags((prev) => {
      if (prev[key] === dirty) return prev
      return { ...prev, [key]: dirty }
    })
  }, [])
  const isDirty = useMemo(() => Object.values(flags).some(Boolean), [flags])
  useDocumentDirtyGuard(isDirty)
  const value = useMemo(() => ({ register, isDirty }), [register, isDirty])
  return <DirtyGuardContext.Provider value={value}>{children}</DirtyGuardContext.Provider>
}

export function useRegisterDirty(key: string, dirty: boolean) {
  const ctx = useContext(DirtyGuardContext)
  useEffect(() => {
    if (!ctx) return
    ctx.register(key, dirty)
    return () => ctx.register(key, false)
  }, [ctx, key, dirty])
}

/** Standalone page guard when a provider is not mounted. */
export function useDirtyGuard(dirty: boolean) {
  useDocumentDirtyGuard(dirty)
}
