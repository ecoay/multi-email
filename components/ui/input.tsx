import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-white/30",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
