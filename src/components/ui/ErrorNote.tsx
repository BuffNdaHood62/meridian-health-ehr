export function ErrorNote({ message, testId }: { message: string; testId?: string }) {
  return (
    <p
      role="alert"
      data-testid={testId ?? "error-note"}
      className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
    >
      {message}
    </p>
  );
}
