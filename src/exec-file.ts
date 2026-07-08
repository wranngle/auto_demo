import {execFile} from 'node:child_process';

// Typed two-argument wrapper — the only call shape the codebase uses. The
// classic `promisify(execFile)` trips @typescript-eslint/strict-void-return
// on execFile's overloads (it returns a ChildProcess where promisify expects
// a void callback signature); a plain Promise wrapper keeps that rule fully
// on for the call sites that genuinely need it.
export async function execFileAsync(command: string, args: string[]): Promise<{stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(JSON.stringify(error)));
        return;
      }

      resolve({stdout, stderr});
    });
  });
}
