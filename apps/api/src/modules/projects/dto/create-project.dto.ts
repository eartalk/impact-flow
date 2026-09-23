import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-_]*$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  repositoryUrl!: string;

  @IsString()
  @IsNotEmpty()
  productionBranch!: string;

}
