import type { SetAppState, Task } from '../../Task.js'

export type LocalWorkflowTaskState = {
  id: string
  type: 'local_workflow'
  status: string
  description: string
}

export const LocalWorkflowTask: Task = {
  name: 'Local workflow',
  type: 'local_workflow',
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

export const killWorkflowTask = LocalWorkflowTask.kill
export async function skipWorkflowAgent(): Promise<void> {}
export async function retryWorkflowAgent(): Promise<void> {}

