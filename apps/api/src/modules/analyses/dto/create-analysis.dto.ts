import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAnalysisDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;
}

