export function isCameraPermissionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
  )
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred.'
}
