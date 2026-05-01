Task management (TickTick) — call directly:
- Show / check tasks → get_tasks
- Add a task → create_task. Use due (YYYY-MM-DD) for deadlines; priority: high for urgent.
- Mark done → complete_task if taskId is known; otherwise get_tasks first.
- Change due date, title, or priority → get_tasks then update_task.
