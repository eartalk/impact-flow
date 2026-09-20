import { IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsIn(['ADMIN', 'MEMBER', 'VIEWER'])
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';
}
