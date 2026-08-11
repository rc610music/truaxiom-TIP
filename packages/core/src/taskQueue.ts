import type { Priority, Task, TaskWorkflowStatus } from "@truaxiom/types";

const priorityWeight: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  urgent: 5
};

const workflowOrder: Record<TaskWorkflowStatus, number> = {
  in_progress: 1,
  ready: 2,
  review: 3,
  blocked: 4,
  backlog: 5,
  done: 6
};

export function getOpenTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.workflowStatus !== "done");
}

export function sortTasksForMissionControl(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const priorityDifference = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDifference !== 0) return priorityDifference;

    const workflowDifference = workflowOrder[a.workflowStatus] - workflowOrder[b.workflowStatus];
    if (workflowDifference !== 0) return workflowDifference;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function groupTasksByWorkflowStatus(tasks: Task[]): Record<TaskWorkflowStatus, Task[]> {
  return tasks.reduce<Record<TaskWorkflowStatus, Task[]>>(
    (groups, task) => {
      groups[task.workflowStatus].push(task);
      return groups;
    },
    {
      backlog: [],
      ready: [],
      in_progress: [],
      blocked: [],
      review: [],
      done: []
    }
  );
}
