"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { setHomeLayout } from "@/app/home/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { DragGrip } from "@/components/dashboard/bubbles/DragGrip";
import { useReorderableGrid } from "@/components/dashboard/bubbles/useReorderableGrid";
import { HomeWidget, type HomeData } from "@/components/dashboard/home/HomeWidgets";
import {
  HOME_WIDGETS,
  HOME_WIDGET_GROUPS,
  homeWidgetMeta,
  isFullWidthAt,
  type HomeWidgetId,
} from "@/lib/home-shared";

// The Home tab: a board of the portal's OWN bubbles, arranged by the member.
//
// Two rules shape it:
//
// 1. ROW RHYTHM. The board alternates a full-width row with a two-column row
//    (isFullWidthAt in lib/home-shared.ts), so it reads as a rhythm rather than
//    a uniform wall of half-cards. Position decides width — a member reordering
//    tiles is also choosing which of them get the full row.
//
// 2. REAL BUBBLES. Each tile is the same panel component its own tab renders,
//    mounted through HomeWidgets.tsx with the board's drag chrome. Home doesn't
//    keep condensed copies of other tabs' cards, so they can't drift.
//
// The server fetches the data for the ENABLED widgets only (see
// app/home/page.tsx); toggling one on therefore needs a refresh to fill in a
// source that wasn't loaded, which the customize dialog triggers on close.

export function HomeBoard({
  initialLayout,
  data,
}: {
  initialLayout: HomeWidgetId[];
  data: HomeData;
}) {
  // Local layout is the source of truth for what's shown and in what order;
  // reorder and customize both update it and persist.
  const [layout, setLayout] = useState<HomeWidgetId[]>(initialLayout);
  const [customizing, setCustomizing] = useState(false);

  // Referentially stable except when `layout` actually changes — otherwise the
  // reorder hook's items-sync would reset the order on every render and fight
  // an in-progress drag.
  const items = useMemo(() => layout.map((id) => ({ id })), [layout]);
  const { order, error, reorder, bubbleProps, handleProps } = useReorderableGrid(
    {
      items,
      getId: (item) => item.id,
      onReorder: (ids) => {
        setLayout(ids as HomeWidgetId[]);
        return setHomeLayout(ids);
      },
    },
  );

  // The most recent layout save. Toggling is fire-and-forget so the checkbox
  // stays instant, but closing the dialog can RELOAD the page (to fetch a newly
  // enabled widget's data) — and a reload would abort an in-flight POST and
  // silently lose the change. So the dialog waits on this first.
  const pendingSave = useRef<Promise<unknown> | null>(null);

  function toggleWidget(id: HomeWidgetId, on: boolean) {
    const next = on
      ? layout.includes(id)
        ? layout
        : [...layout, id]
      : layout.filter((w) => w !== id);
    setLayout(next);
    pendingSave.current = setHomeLayout(next);
  }

  return (
    <>
      <div className="ff-actions">
        <div className="ff-actions__row ff-home-board__toolbar">
          <button
            type="button"
            className="ff-btn ff-btn--outline"
            aria-haspopup="dialog"
            onClick={() => setCustomizing(true)}
          >
            <PlusIcon />
            Customize Home
          </button>
        </div>
      </div>

      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {order.length === 0 ? (
        <div className="ff-bubble-grid">
          <Bubble title="Your Home Screen" span="full">
            <p className="ff-auth__hint">
              Your board is empty. Use <strong>Customize Home</strong> above to
              add bubbles — any card from around the site can live here.
            </p>
          </Bubble>
        </div>
      ) : (
        <div className="ff-bubble-grid">
          {order.map((item, index) => {
            const meta = homeWidgetMeta(item.id);
            if (!meta) return null;
            return (
              <HomeWidget
                key={item.id}
                id={item.id}
                data={data}
                chrome={{
                  ...bubbleProps(index),
                  // The rotating rhythm decides the width, not the panel.
                  span: isFullWidthAt(index, order.length) ? "full" : undefined,
                  dragHandle: (
                    <DragGrip
                      {...handleProps(index)}
                      label={`Move ${meta.title}`}
                    />
                  ),
                  actions: (
                    <span className="ff-reorder" role="group" aria-label="Reorder">
                      <button
                        className="ff-reorder__btn"
                        type="button"
                        disabled={index === 0}
                        title="Move up"
                        onClick={() => reorder(index, index - 1)}
                      >
                        <span className="screen-reader-text">
                          Move {meta.title} up
                        </span>
                        <Chevron up />
                      </button>
                      <button
                        className="ff-reorder__btn"
                        type="button"
                        disabled={index === order.length - 1}
                        title="Move down"
                        onClick={() => reorder(index, index + 1)}
                      >
                        <span className="screen-reader-text">
                          Move {meta.title} down
                        </span>
                        <Chevron />
                      </button>
                    </span>
                  ),
                }}
              />
            );
          })}
        </div>
      )}

      <CustomizeDialog
        open={customizing}
        enabled={layout}
        onToggle={toggleWidget}
        flush={() => pendingSave.current ?? Promise.resolve()}
        onClose={() => setCustomizing(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Customize popup — every pinnable bubble on the site, grouped by the tab it
// comes from so the list stays readable as tabs add cards.
// ---------------------------------------------------------------------------

function CustomizeDialog({
  open,
  enabled,
  onToggle,
  flush,
  onClose,
}: {
  open: boolean;
  enabled: HomeWidgetId[];
  onToggle: (id: HomeWidgetId, on: boolean) => void;
  /** Resolves once the latest layout save has landed. */
  flush: () => Promise<unknown>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // What was enabled when the dialog opened: if the set CHANGED, closing needs
  // a server round-trip, because a newly enabled widget's data source wasn't
  // loaded by this render (app/home/page.tsx fetches only what's enabled).
  const openedWith = useRef<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openedWith.current = [...enabled].sort().join(",");
      setDirty(false);
      setSaving(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // `enabled` is read only at the moment of opening, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    // A reload, not router.refresh(): the newly enabled panels need their
    // server data, and several of them (Integrations, Profile) also re-read
    // session state. One full navigation is cheaper than a partial that leaves
    // a widget in its empty state until the next click.
    if (dirty && [...enabled].sort().join(",") !== openedWith.current) {
      setSaving(true);
      // Wait for the layout POST — reloading over it would lose the change.
      void flush().then(() => window.location.reload());
      return;
    }
    onClose();
  }

  return (
    <dialog ref={ref} className="ff-dialog ff-dialog--customize" onClose={close}>
      <h2 className="ff-dialog__title">Customize Home</h2>
      <p className="ff-dialog__text">
        Every bubble from around the site can live here. Pick the ones you want,
        then drag them on the board to reorder — the board alternates a
        full-width row with a two-column row, so the order also sets the size.
      </p>
      <div className="ff-customize__scroll">
        {HOME_WIDGET_GROUPS.map((group) => {
          const widgets = HOME_WIDGETS.filter((w) => w.group === group);
          if (!widgets.length) return null;
          return (
            <section key={group} className="ff-customize__group">
              <h3 className="ff-customize__grouptitle">{group}</h3>
              <ul className="ff-customize__list">
                {widgets.map((w) => (
                  <li key={w.id} className="ff-customize__item">
                    <label className="ff-customize__label">
                      <input
                        type="checkbox"
                        checked={enabled.includes(w.id)}
                        onChange={(event) => {
                          setDirty(true);
                          onToggle(w.id, event.target.checked);
                        }}
                      />
                      <span className="ff-customize__text">
                        <span className="ff-customize__name">{w.title}</span>
                        <span className="ff-customize__desc">{w.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="ff-dialog__actions">
        <button
          type="button"
          className="ff-btn"
          onClick={close}
          disabled={saving}
        >
          {saving ? "Saving\u2026" : "Done"}
        </button>
      </div>
    </dialog>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d={up ? "M1.5 8L6 4L10.5 8" : "M1.5 4L6 8L10.5 4"}
        strokeWidth="1.5"
      />
    </svg>
  );
}
