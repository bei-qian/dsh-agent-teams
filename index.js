/**
 * Host half of the dsh-agent-teams bundle.
 *
 * The bundle is primarily a configuration bundle: its patch inserts the BMad
 * squad agent presets (see cordis.patch.yml). It also declares a browser half
 * (`dsh.client` + `./client`), whose job is to keep the preset picker tidy.
 *
 * This Host entry is a no-op. Its only purpose is to give the package a Loader
 * row named by the bare package specifier (`dsh-agent-teams`), which is what
 * lets @deepseek-ai/dsh-client-modules discover the `dsh.client` declaration
 * and load client.js. Rows named `dsh-agent-teams/rows/...` are subpath entries
 * and are intentionally ignored by that scanner.
 */
export const name = 'dsh-agent-teams'

export function apply() {}
