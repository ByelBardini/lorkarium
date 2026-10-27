/** Last resort when a route throws something other than a redirect.
 *
 *  Example: `{ ErrorBoundary: RouteErrorScreen }` on the root route */
export function RouteErrorScreen(): React.JSX.Element {
  return (
    <main className="grid min-h-app place-items-center bg-background px-4 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[32px] font-semibold">Algo deu errado</h1>
        <p className="text-muted-foreground">Recarregue a página para tentar de novo.</p>
      </div>
    </main>
  );
}
