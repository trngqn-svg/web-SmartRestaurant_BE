import type { AppRole } from './role.type';

export type AuthSubjectType = 'ACCOUNT' | 'USER';

export type AuthUser = {
  subjectType: AuthSubjectType;
  subjectId: string;
  role: AppRole;
};
