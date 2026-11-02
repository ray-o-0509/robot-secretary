
## 1Password Environments (.env)

Personal repositories keep their environment variables in 1Password Environments. The `.env` file in the repository is a FIFO mounted by 1Password, not a regular file. It cannot be read while 1Password is locked.

| Repository | File | Environment |
|---|---|---|
| tixmo | `.env.local` | `tixmo-local` |
| tixmo | `.env.prod` | `tixmo-prod` |
| studydesk | `.env.local` | `studydesk` |
| agent-desk | `.env.local` | `agent-desk` |
| notes | `.env.local` | `notes` |
| robot-secretary | `.env.local` | `robot-secretary` |
| part-ii-graph-memory | `.env` | `part-ii-graph-memory` |

de-app and gen-pptx are excluded: their env files stay regular files.

Use the `1password` MCP server for env work:

- Call `authenticate` first; it returns the account ID. Then `list_environments`, and `list_variables` to see which variable names exist. It never returns values.
- Do not `cat` an env file to check a variable: use `list_variables`.
- Do not replace a mounted file with a regular `.env`. Do not edit it directly: edits do not reach 1Password.
- New variable: `append_variables`, with `concealed: true` for secrets. Never put a secret value in chat or a tool argument of the conversation: ask the user to add it in 1Password (Developer > Environments), or load it from a local file with a script that does not print it.
- Changing or deleting a variable has no MCP tool: the user does it in 1Password.
- New project: `create_environment`, then `create_local_env_file` with the absolute path of the env file.
