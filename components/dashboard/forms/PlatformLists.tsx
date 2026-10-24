import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { CopyButton } from "@/components/dashboard/forms/CopyButton";

export type PlatformListData = {
  kind: string;
  label: string;
  hint: string;
  lines: string[];
  /** Lines per copy; null = one list. */
  batch: number | null;
};

/**
 * One row per platform the form collected handles for, each copyable in the
 * shape that platform's admin tools accept — start.gg's Bulk Add in 50s.
 * Shared (no directive): only the copy buttons are client components.
 */
export function PlatformLists({ lists }: { lists: PlatformListData[] }) {
  return (
    <>
      {lists.map((list) => {
        const chunks: string[][] = [];
        const size = list.batch ?? Math.max(list.lines.length, 1);
        for (let i = 0; i < list.lines.length; i += size) {
          chunks.push(list.lines.slice(i, i + size));
        }
        return (
          <BubbleRow
            key={list.kind}
            label={list.label}
            value={list.lines.length === 1 ? "1 player" : `${list.lines.length} players`}
            note={list.hint}
            action={
              list.lines.length ? (
                <div className="ff-row__buttons">
                  {chunks.map((chunk, index) => {
                    const from = index * size + 1;
                    return (
                      <CopyButton
                        key={from}
                        text={chunk.join("\n")}
                        label={
                          chunks.length > 1
                            ? `Copy ${from}–${from + chunk.length - 1}`
                            : "Copy List"
                        }
                        small
                      />
                    );
                  })}
                </div>
              ) : undefined
            }
          />
        );
      })}
    </>
  );
}
