import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

export interface AuthUser {
  userId: string;
  sessionId: string;
  role: UserRole;
  status: UserStatus;
}
