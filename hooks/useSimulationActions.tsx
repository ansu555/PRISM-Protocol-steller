'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type SidebarSimulationAction = 'yield' | 'default' | 'market';

type ActionRegistry = Partial<Record<SidebarSimulationAction, () => void>>;

interface SimulationActionContextValue {
  actions: ActionRegistry;
  registerActions: (actions: ActionRegistry) => () => void;
  runAction: (action: SidebarSimulationAction) => void;
}

const SimulationActionContext = createContext<SimulationActionContextValue | null>(null);

export function SimulationActionProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ActionRegistry>({});
  const actionsRef = useRef<ActionRegistry>({});

  const registerActions = useCallback((nextActions: ActionRegistry) => {
    setActions((current) => {
      const next = { ...current, ...nextActions };
      actionsRef.current = next;
      return next;
    });
    return () => {
      setActions((current) => {
        const copy = { ...current };
        for (const key of Object.keys(nextActions) as SidebarSimulationAction[]) {
          delete copy[key];
        }
        actionsRef.current = copy;
        return copy;
      });
    };
  }, []);

  const runAction = useCallback((action: SidebarSimulationAction) => {
    actionsRef.current[action]?.();
  }, []);

  const value = useMemo<SimulationActionContextValue>(
    () => ({
      actions,
      registerActions,
      runAction,
    }),
    [actions, registerActions, runAction],
  );

  return (
    <SimulationActionContext.Provider value={value}>{children}</SimulationActionContext.Provider>
  );
}

export function useSimulationActions() {
  const value = useContext(SimulationActionContext);
  if (!value) {
    throw new Error('useSimulationActions must be used inside SimulationActionProvider');
  }
  return value;
}
