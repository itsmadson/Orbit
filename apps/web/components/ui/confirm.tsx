"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";

type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  /** The label on the button that does the thing. Name the action, not "OK". */
  confirmLabel?: string;
  destructive?: boolean;
};

const ConfirmContext = React.createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

/**
 * Confirmation for anything that cannot be undone.
 *
 * Returns a promise so a call site reads as a guard rather than a callback
 * pyramid:  `if (!(await confirm({...}))) return;`
 */
export function useConfirm() {
  const context = React.useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside ConfirmProvider");
  return context;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [state, setState] = React.useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader title={state?.title ?? ""} />
          <div className="flex gap-3 px-4 py-3">
            {state?.destructive ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger">
                <AlertTriangle className="h-4 w-4" />
              </span>
            ) : null}
            <div className="text-[13px] leading-relaxed text-muted">{state?.body}</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => close(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              variant={state?.destructive ? "danger" : "primary"}
              onClick={() => close(true)}
              autoFocus
            >
              {state?.confirmLabel ?? t("action.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
