export type Client = {
  id: string;
  company_id: string;
  name: string;
  contact_email: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
};
