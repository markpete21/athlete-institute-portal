'use client';

/**
 * Staff-only 1-5 skill rating select — saves on change. The rating lives on
 * the athlete (family_members.staff_skill_rating) and is never public.
 */
export default function RatingSelect({
  action,
  familyMemberId,
  divisionId,
  value,
}: {
  action: (formData: FormData) => Promise<void>;
  familyMemberId: number;
  divisionId: number;
  value: number | null;
}) {
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="familyMemberId" value={familyMemberId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <select
        name="rating"
        defaultValue={value ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input w-16 py-1 text-center font-mono text-sm"
        aria-label="Skill rating"
      >
        <option value="">—</option>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </form>
  );
}
