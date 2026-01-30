import { useState, useCallback } from 'react';
import { ToolExecution, ToolExecutionStatus } from '../types';

interface UseToolPanelReturn {
  isOpen: boolean;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  executions: ToolExecution[];
  addExecution: (toolName: string, input: unknown) => string;
  updateExecution: (id: string, update: Partial<ToolExecution>) => void;
  completeExecution: (id: string, output: unknown) => void;
  failExecution: (id: string, error: string) => void;
  clearExecutions: () => void;
  hasRunningTools: boolean;
}

export function useToolPanel(): UseToolPanelReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [executions, setExecutions] = useState<ToolExecution[]>([]);

  const togglePanel = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const openPanel = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const addExecution = useCallback((toolName: string, input: unknown): string => {
    const id = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const execution: ToolExecution = {
      id,
      toolName,
      input,
      status: 'running',
      startTime: new Date()
    };

    setExecutions(prev => [execution, ...prev]);
    return id;
  }, []);

  const updateExecution = useCallback((id: string, update: Partial<ToolExecution>) => {
    setExecutions(prev =>
      prev.map(exec =>
        exec.id === id ? { ...exec, ...update } : exec
      )
    );
  }, []);

  const completeExecution = useCallback((id: string, output: unknown) => {
    setExecutions(prev =>
      prev.map(exec =>
        exec.id === id
          ? { ...exec, status: 'completed' as ToolExecutionStatus, output, endTime: new Date() }
          : exec
      )
    );
  }, []);

  const failExecution = useCallback((id: string, error: string) => {
    setExecutions(prev =>
      prev.map(exec =>
        exec.id === id
          ? { ...exec, status: 'error' as ToolExecutionStatus, error, endTime: new Date() }
          : exec
      )
    );
  }, []);

  const clearExecutions = useCallback(() => {
    setExecutions([]);
  }, []);

  const hasRunningTools = executions.some(exec => exec.status === 'running');

  return {
    isOpen,
    togglePanel,
    openPanel,
    closePanel,
    executions,
    addExecution,
    updateExecution,
    completeExecution,
    failExecution,
    clearExecutions,
    hasRunningTools
  };
}
