import type { AgentId } from '../../types/ids.js'
import type { SetAppState, Task } from '../../Task.js'

export type MonitorMcpTaskState = {
  id: string
  type: 'monitor_mcp'
  status: string
  description: string
  agentId?: AgentId
}

export const MonitorMcpTask: Task = {
  name: 'MCP monitor',
  type: 'monitor_mcp',
  async kill(taskId: string, setAppState: SetAppState) {
    setAppState(prev => ({
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...prev.tasks[taskId],
          status: 'killed',
          endTime: Date.now(),
        },
      },
    }))
  },
}

export const killMonitorMcp = MonitorMcpTask.kill

export function killMonitorMcpTasksForAgent(
  agentId: AgentId,
  getAppState: () => { tasks?: Record<string, { agentId?: AgentId }> },
  setAppState: SetAppState,
): void {
  const tasks = getAppState().tasks ?? {}
  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.agentId === agentId) {
      void killMonitorMcp(taskId, setAppState)
    }
  }
}

