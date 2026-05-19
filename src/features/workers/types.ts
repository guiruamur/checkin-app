export type WorkerStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export const LANGUAGE_OPTIONS = [
  'español', 'catalán', 'inglés', 'francés', 'alemán', 'italiano',
  'portugués', 'gallego', 'euskera', 'árabe', 'chino', 'ruso', 'otros',
] as const;
export type LanguageOption = typeof LANGUAGE_OPTIONS[number];

export type Worker = {
  id: string;
  company_id: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  postal_code: string | null;
  languages: LanguageOption[];
  experience_summary: string | null;
  status: WorkerStatus;
  approved_at: string | null;
  approved_by: string | null;
  archived_at: string | null;
  created_at: string;
};
