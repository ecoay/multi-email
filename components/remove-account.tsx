"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";

export function RemoveAccount({ id, nickname, action }: { id: string; nickname: string; action: (formData: FormData) => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setArmed(true)}>
        Remove
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="destructive" size="sm" pendingLabel="Removing...">
        Remove {nickname}
      </SubmitButton>
      <Button type="button" variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </form>
  );
}
