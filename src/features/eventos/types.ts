export type Event = {
  id: string;
  company_id: string;
  client_id: string;
  name: string;
  address: string;
  organizer_email: string;
  access_token: string;
  starts_at: string;
  ends_at: string;
  last_confirmation_sent_at: string | null;
  created_at: string;
  archived_at: string | null;
};

// listEvents / getEvent traen el nombre del cliente con un join PostgREST.
export type EventWithClient = Event & {
  clients: { name: string } | null;
};

export type EventAssignment = {
  id: string;
  event_id: string;
  worker_id: string;
  scheduled_start: string;
  scheduled_end: string;
  created_at: string;
};

export type AssignmentWithWorker = EventAssignment & {
  workers: { first_name: string; last_name: string } | null;
};
