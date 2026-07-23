import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import type { UserType } from '@ai/foundation';

/**
 * Per-user-type settings (Module 1 §User Types): a typed config over the
 * profiles.settings JSONB column, so new settings ship without schema changes.
 * Each type has its own shape + defaults; unknown keys are preserved (forward
 * compatible). The admin settings UI (Stage 3+) edits through these helpers.
 */

export interface TypeSettingsMap {
  customer: {
    /** Marketing email opt-in (CASL) — explicit, defaults off. */
    marketingOptIn: boolean;
  };
  organization: {
    /** Days until invoices are due for this org. */
    invoiceTermsDays: number;
  };
  tenant: {
    /** Which facility areas the tenant's read-only schedule shows ([] = all). */
    scheduleAreas: string[];
  };
  staff: {
    /** Staff discount participation (staff credits) — on by default. */
    staffDiscountsEnabled: boolean;
  };
}

export const TYPE_SETTINGS_DEFAULTS: { [K in UserType]: TypeSettingsMap[K] } = {
  customer: { marketingOptIn: false },
  organization: { invoiceTermsDays: 30 },
  tenant: { scheduleAreas: [] },
  staff: { staffDiscountsEnabled: true },
};

/** Stored settings merged over the type's defaults. */
export function effectiveTypeSettings<T extends UserType>(
  userType: T,
  stored: Record<string, unknown>,
): TypeSettingsMap[T] {
  return { ...TYPE_SETTINGS_DEFAULTS[userType], ...stored } as TypeSettingsMap[T];
}

/** Read a profile's effective settings (defaults ← stored overrides). */
export async function getTypeSettings<T extends UserType>(
  profileId: number,
  userType: T,
): Promise<TypeSettingsMap[T]> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('settings')
    .eq('id', profileId)
    .single();
  if (error) throw new Error(`settings read failed: ${error.message}`);
  return effectiveTypeSettings(userType, (data.settings ?? {}) as Record<string, unknown>);
}

/** Merge a partial update into a profile's stored settings. */
export async function updateTypeSettings<T extends UserType>(
  profileId: number,
  patch: Partial<TypeSettingsMap[T]>,
): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('profiles').select('settings').eq('id', profileId).single();
  if (error) throw new Error(`settings read failed: ${error.message}`);
  const next = { ...((data.settings ?? {}) as Record<string, unknown>), ...patch };
  const { error: e2 } = await db.from('profiles').update({ settings: next }).eq('id', profileId);
  if (e2) throw new Error(`settings update failed: ${e2.message}`);
}
