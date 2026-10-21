import { memo } from "react";

import type { TurnView } from "../types";

export const UserMessage = memo(function UserMessage({ user }: { user: NonNullable<TurnView["user"]> }) {
  return (
    <div className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2 text-sm whitespace-pre-wrap">
      {user.content}
      {user.attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {user.attachments.map((file) => (
            <li
              className="rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-xs"
              key={file.id ?? file.file_name}
            >
              📎 {file.file_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
