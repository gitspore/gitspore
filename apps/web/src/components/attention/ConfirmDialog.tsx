"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Asks before stopping an agent or deleting a worktree.

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  // Label of the confirm button, says what happens ("Stop agent")
  actionLabel: string;
  onConfirm: () => void;
  // Extra content between the text and the buttons, e.g. a checkbox
  children?: ReactNode;
  // Shown when the action failed; the dialog stays open
  error?: string;
};

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  onConfirm,
  children,
  error,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-95 max-w-none bg-panel px-6 py-4 text-ink shadow-lg ring-0 sm:max-w-none">
        <AlertDialogTitle>
          <span className="text-title-notification">{title}</span>
        </AlertDialogTitle>
        <AlertDialogDescription>
          <span className="text-ui-body">{description}</span>
        </AlertDialogDescription>

        {children}

        {error && (
          <p role="alert" className="text-ui-body font-semibold">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm}>
            {actionLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
