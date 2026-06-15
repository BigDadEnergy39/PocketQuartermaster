export type UnitRole = 'quartermaster' | 'assistant_quartermaster' | 'youth_quartermaster' | 'member';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Unit {
  id: string;
  name: string;
  accent_color: string;
  created_by: string;
  created_at: string;
}

export interface UnitMember {
  id: string;
  unit_id: string;
  user_id: string;
  role: UnitRole;
  invited_by: string | null;
  joined_at: string;
}

export interface UnitWithRole extends Unit {
  role: UnitRole;
}
