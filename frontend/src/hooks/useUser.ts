// useUser — decodes the JWT stored in localStorage and returns the current user's profile.
// The profile is embedded in the token at login time — no extra API call needed.
//
// Usage in any agent page:
//   const user = useUser();
//   console.log(user.company);      // "ACME Corp"
//   console.log(user.competitors);  // "竞品A, 竞品B"
//   console.log(user.industry);     // "电商"

export interface UserProfile {
  name: string;
  company: string;
  industry: string;
  competitors: string;   // comma-separated string, e.g. "竞品A, 竞品B"
  goal: string;
  sub: string;           // phone or email — unique identifier
  isLoggedIn: boolean;
}

const EMPTY: UserProfile = {
  name: "", company: "", industry: "", competitors: "", goal: "", sub: "", isLoggedIn: false,
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64url = token.split(".")[1];
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

export function useUser(): UserProfile {
  const token = localStorage.getItem("rebase_token");
  if (!token) return EMPTY;
  try {
    const payload = decodeJwtPayload(token);
    if (!payload.exp || (payload.exp as number) * 1000 < Date.now()) return EMPTY;
    return {
      name: (payload.name as string) || "",
      company: (payload.company as string) || "",
      industry: (payload.industry as string) || "",
      competitors: (payload.competitors as string) || "",
      goal: (payload.goal as string) || "",
      sub: (payload.sub as string) || "",
      isLoggedIn: true,
    };
  } catch {
    return EMPTY;
  }
}
