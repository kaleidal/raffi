export interface AppUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: 'ave';
  token: string;
}
