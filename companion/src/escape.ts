// Quoting helpers for the files `aisidebar-companion install` writes. Kept separate so they can be tested.

export function xml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** PowerShell single-quoted string literal. */
export function psq(s: string) {
  return `'${s.replace(/'/g, "''")}'`;
}

export function windowsLauncherScript(node: string, args: string[]): string {
  // Start-Process needs embedded double quotes around arguments with spaces (Windows paths can't contain ").
  const list = args.map((a) => psq(`"${a}"`)).join(", ");
  return (
    `# Starts the AI Sidebar companion in the background, with no window. Created by "aisidebar-companion install".\r\n` +
    `Start-Process -WindowStyle Hidden -FilePath ${psq(node)} -ArgumentList @(${list})\r\n`
  );
}

/** systemd ExecStart= argument: quoted, with %, \ and " escaped. */
export function systemdArg(s: string) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%")}"`;
}
