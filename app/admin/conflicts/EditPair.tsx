'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { editPairAction } from './actions';

export interface EditablePairSide {
  id: number;
  title: string;
  /** Toronto local values for the inputs. */
  date: string;   // YYYY-MM-DD
  start: string;  // HH:MM
  end: string;    // HH:MM
}

/**
 * The resolve-by-edit path: a popup editing BOTH bookings' date and times at
 * once. Saving re-runs the availability engine server-side - a pair that no
 * longer overlaps leaves the queue on refresh.
 */
export function EditPair({ a, b }: { a: EditablePairSide; b: EditablePairSide }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Edit times
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit both bookings">
        <form action={editPairAction} className="flex flex-col gap-5">
          {([['a', a], ['b', b]] as const).map(([side, bk]) => (
            <fieldset key={side} className="flex flex-col gap-2 border-t border-hairline pt-3 first:border-t-0 first:pt-0">
              <legend className="sr-only">{bk.title}</legend>
              <p className="text-sm font-bold text-ink">{bk.title}</p>
              <input type="hidden" name={`id-${side}`} value={bk.id} />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="field-label" htmlFor={`date-${side}`}>Date</label>
                  <input id={`date-${side}`} type="date" name={`date-${side}`} defaultValue={bk.date} required className="input h-9 text-sm" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`start-${side}`}>Start</label>
                  <input id={`start-${side}`} type="time" name={`start-${side}`} defaultValue={bk.start} required className="input h-9 text-sm" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`end-${side}`}>End</label>
                  <input id={`end-${side}`} type="time" name={`end-${side}`} defaultValue={bk.end} required className="input h-9 text-sm" />
                </div>
              </div>
            </fieldset>
          ))}
          <p className="text-sm text-silver">
            Times are Toronto local. If the edit clears the overlap, the pair
            leaves this queue automatically.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-gold btn-sm" onClick={() => setOpen(false)}>Save both</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
