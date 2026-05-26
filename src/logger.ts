/**
 * Safe, structured logging utility for MCP servers.
 * Outputs exclusively to process.stderr to prevent corrupting the stdio transport channel (stdout).
 */
export const log = {
  debug: (message: string) => {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
      process.stderr.write(`[DEBUG] ${new Date().toISOString()} - ${message}\n`);
    }
  },
  
  info: (message: string) => {
    process.stderr.write(`[INFO] ${new Date().toISOString()} - ${message}\n`);
  },
  
  warn: (message: string) => {
    process.stderr.write(`[WARN] ${new Date().toISOString()} - ${message}\n`);
  },
  
  error: (message: string, error?: unknown) => {
    const errorDetails = error instanceof Error ? error.stack : String(error);
    process.stderr.write(`[ERROR] ${new Date().toISOString()} - ${message}${error ? `\nDetails: ${errorDetails}` : ""}\n`);
  }
};
